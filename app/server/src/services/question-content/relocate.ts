import { and, eq, sql, type SQL } from 'drizzle-orm'
import path from 'node:path'
import type { z } from 'zod'

import { db } from '../../db/index.js'
import { questions, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError, isUniqueViolation } from '../../lib/errors.js'
import type { TopicSchema, UpdateTestSettingsSchema } from '../../schemas/tests.js'
import { updateQuestionSearchDocumentLocation } from '../search/question-documents.js'
import { StorageKeyError, storage } from '../storage/index.js'
import { lockTest, type Tx } from './order.js'
import { contentKey, newRevision, questionMarkdownCandidates, testPrefix, type ContentKind } from './paths.js'
import { CONTENT_CHANGED_MESSAGE } from './write.js'

export const COPY_CONCURRENCY = 8

export const RELOCATION_FAILED_MESSAGE = 'Не удалось перенести файлы, переименование отменено'

export const PUBLISH_WITHOUT_QUESTIONS_MESSAGE = 'Для публикации добавьте хотя бы один вопрос'

const ORPHAN_LOG_PREFIX = '[question-content] orphan objects'

const SWITCH_BATCH_SIZE = 500

export type RelocationRow = {
	id: string
	testId: string
	promptPath: string | null
	explanationPath: string | null
	topicSlug: string
	testSlug: string
}

export type RelocationTarget = { topicSlug: string; testSlug?: string }

export type RelocationPair = { questionId: string; kind: ContentKind; from: string; to: string }

export type PointerSwitch = {
	questionId: string
	fromPrompt: string | null
	fromExplanation: string | null
	toPrompt: string | null
	toExplanation: string | null
}

export type RelocationPlan = { pairs: RelocationPair[]; pointers: PointerSwitch[] }

export type RelocateOptions = { failureMessage?: string }

export type TopicUpdateInput = Partial<z.infer<typeof TopicSchema>>

export type TestSettingsInput = z.infer<typeof UpdateTestSettingsSchema>

type TopicRow = typeof topics.$inferSelect

type TestRow = typeof tests.$inferSelect

type IdRow = { id: string }

type SlugRow = { id: string; slug: string }

type KeyRow = { key: string }

function candidatePrefix(key: string): string | null {
	const segments = key.split('/')
	if (segments[0] === 'topics' && segments.length >= 4) return segments.slice(0, 3).join('/')
	const dir = path.posix.dirname(key)
	return dir === '.' || dir === '' ? null : dir
}

async function existingKeys(prefixes: Set<string>): Promise<Set<string>> {
	const module = storage()
	const found = new Set<string>()
	for (const prefix of prefixes) {
		let objects
		try {
			objects = await module.list(prefix, { recursive: true })
		} catch (error) {
			if (error instanceof StorageKeyError) continue
			throw error
		}
		for (const object of objects) found.add(object.key)
	}
	return found
}

function rebase(value: string | null, fromPrefix: string, toPrefix: string): string | null {
	if (!value || fromPrefix === toPrefix) return value
	return value.startsWith(`${fromPrefix}/`) ? `${toPrefix}${value.slice(fromPrefix.length)}` : value
}

function candidatesFor(row: RelocationRow, kind: ContentKind): string[] {
	const storedPath = kind === 'prompt' ? row.promptPath : row.explanationPath
	if (kind === 'explanation' && !storedPath) return []
	return questionMarkdownCandidates({
		storedPath,
		topicSlug: row.topicSlug,
		testSlug: row.testSlug,
		testId: row.testId,
		questionId: row.id,
		fileName: `${kind}.md`,
	})
}

export async function planRelocation(rows: RelocationRow[], target: RelocationTarget): Promise<RelocationPlan> {
	const candidates = new Map<string, Record<ContentKind, string[]>>()
	const prefixes = new Set<string>()
	for (const row of rows) {
		const entry = { prompt: candidatesFor(row, 'prompt'), explanation: candidatesFor(row, 'explanation') }
		candidates.set(row.id, entry)
		for (const key of [...entry.prompt, ...entry.explanation]) {
			const prefix = candidatePrefix(key)
			if (prefix) prefixes.add(prefix)
		}
	}
	const present = await existingKeys(prefixes)

	const pairs: RelocationPair[] = []
	const pointers: PointerSwitch[] = []
	for (const row of rows) {
		const entry = candidates.get(row.id) ?? { prompt: [], explanation: [] }
		const fromPrefix = testPrefix(row.topicSlug, row.testSlug)
		const toTestSlug = target.testSlug ?? row.testSlug
		const toPrefix = testPrefix(target.topicSlug, toTestSlug)
		const rev = newRevision()
		const resolve = (kind: ContentKind, value: string | null): string | null => {
			const source = entry[kind].find((key) => present.has(key))
			if (!source) return rebase(value, fromPrefix, toPrefix)
			const to = contentKey({ topicSlug: target.topicSlug, testSlug: toTestSlug, questionId: row.id, kind, rev })
			pairs.push({ questionId: row.id, kind, from: source, to })
			return to
		}
		pointers.push({
			questionId: row.id,
			fromPrompt: row.promptPath,
			fromExplanation: row.explanationPath,
			toPrompt: resolve('prompt', row.promptPath),
			toExplanation: resolve('explanation', row.explanationPath),
		})
	}
	return { pairs, pointers }
}

export async function switchPointers(tx: Tx, pointers: PointerSwitch[]): Promise<void> {
	let updated = 0
	for (let index = 0; index < pointers.length; index += SWITCH_BATCH_SIZE) {
		const batch = pointers.slice(index, index + SWITCH_BATCH_SIZE)
		const values = sql.join(
			batch.map(
				(pointer) =>
					sql`(${pointer.questionId}::uuid, ${pointer.fromPrompt ?? null}::text, ${pointer.fromExplanation ?? null}::text, ${pointer.toPrompt ?? null}::text, ${pointer.toExplanation ?? null}::text)`
			),
			sql`, `
		)
		const result = await tx.execute(sql`
			UPDATE questions AS q
			SET prompt_path = v.to_prompt,
				explanation_path = v.to_explanation,
				updated_at = CASE
					WHEN q.prompt_path IS DISTINCT FROM v.to_prompt OR q.explanation_path IS DISTINCT FROM v.to_explanation
					THEN now()
					ELSE q.updated_at
				END
			FROM (VALUES ${values}) AS v(id, from_prompt, from_explanation, to_prompt, to_explanation)
			WHERE q.id = v.id
				AND q.prompt_path IS NOT DISTINCT FROM v.from_prompt
				AND q.explanation_path IS NOT DISTINCT FROM v.from_explanation
		`)
		updated += result.rowCount ?? 0
	}
	if (updated < pointers.length) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
}

async function removeObjects(keys: string[]): Promise<void> {
	if (keys.length === 0) return
	try {
		await storage().remove(keys)
	} catch {
		console.warn(ORPHAN_LOG_PREFIX, keys)
	}
}

type NullPointerRow = {
	id: string
	test_id: string
	test_slug: string
	topic_slug: string
	prompt_path: string | null
	explanation_path: string | null
}

async function fallbackCandidates(tx: Tx, keys: string[]): Promise<Set<string>> {
	const topicSlugs = new Set<string>()
	for (const key of keys) {
		const segments = key.split('/')
		if (segments[0] === 'topics' && segments[1]) topicSlugs.add(segments[1])
	}
	const found = new Set<string>()
	if (topicSlugs.size === 0) return found
	const list = sql.join(
		[...topicSlugs].map((slug) => sql`${slug}`),
		sql`, `
	)
	const result = await tx.execute<NullPointerRow>(sql`
		SELECT q.id, q.test_id, t.slug AS test_slug, tp.slug AS topic_slug, q.prompt_path, q.explanation_path
		FROM questions q
		JOIN tests t ON t.id = q.test_id
		JOIN topics tp ON tp.id = t.topic_id
		WHERE tp.slug IN (${list}) AND (q.prompt_path IS NULL OR q.explanation_path IS NULL)
	`)
	for (const row of result.rows) {
		const kinds: ContentKind[] = []
		if (row.prompt_path === null) kinds.push('prompt')
		if (row.explanation_path === null) kinds.push('explanation')
		for (const kind of kinds) {
			const candidates = questionMarkdownCandidates({
				storedPath: null,
				topicSlug: row.topic_slug,
				testSlug: row.test_slug,
				testId: row.test_id,
				questionId: row.id,
				fileName: `${kind}.md`,
			})
			for (const candidate of candidates) found.add(candidate)
		}
	}
	return found
}

async function unreferencedKeys(tx: Tx, keys: string[]): Promise<string[]> {
	const unique = [...new Set(keys)]
	if (unique.length === 0) return []
	const list = sql.join(
		unique.map((key) => sql`${key}`),
		sql`, `
	)
	const result = await tx.execute<KeyRow>(sql`
		SELECT prompt_path AS key FROM questions WHERE prompt_path IN (${list})
		UNION
		SELECT explanation_path AS key FROM questions WHERE explanation_path IN (${list})
	`)
	const used = new Set(result.rows.map((row) => row.key))
	const unused = unique.filter((key) => !used.has(key))
	if (unused.length === 0) return unused
	const fallbacks = await fallbackCandidates(tx, unused)
	return unused.filter((key) => !fallbacks.has(key))
}

export async function relocateQuestionObjects<T>(
	pairs: RelocationPair[],
	switchInTx: (tx: Tx) => Promise<T>,
	{ failureMessage = RELOCATION_FAILED_MESSAGE }: RelocateOptions = {}
): Promise<T> {
	const sources = new Set(pairs.map((pair) => pair.from))
	const targets = [...new Set(pairs.map((pair) => pair.to))].filter((key) => !sources.has(key))
	const module = storage()
	const attempted: string[] = []

	for (let index = 0; index < pairs.length; index += COPY_CONCURRENCY) {
		const batch = pairs.slice(index, index + COPY_CONCURRENCY)
		attempted.push(...batch.map((pair) => pair.to))
		const results = await Promise.allSettled(batch.map((pair) => module.copy(pair.from, pair.to)))
		if (results.some((result) => result.status === 'rejected')) {
			await removeObjects([...new Set(attempted)].filter((key) => !sources.has(key)))
			throw new ApiError(503, failureMessage)
		}
	}

	let outcome: { result: T; stale: string[] }
	try {
		outcome = await db.transaction(async (tx) => {
			const result = await switchInTx(tx)
			const stale = await unreferencedKeys(tx, [...sources])
			return { result, stale }
		})
	} catch (error) {
		await removeObjects(targets)
		throw error
	}

	await removeObjects(outcome.stale)
	return outcome.result
}

function conflictOnUniqueViolation(message: string): (error: unknown) => never {
	return (error) => {
		if (isUniqueViolation(error)) throw new ApiError(409, message)
		throw error
	}
}

async function lockPlannedTest(
	tx: Tx,
	testId: string,
	expected: { slug: string; topicId: string; version?: number }
): Promise<void> {
	let locked
	try {
		locked = await lockTest(tx, testId)
	} catch (error) {
		if (error instanceof ApiError && error.statusCode === 404) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		throw error
	}
	if (locked.slug !== expected.slug || locked.topicId !== expected.topicId) {
		throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
	if (expected.version !== undefined && locked.version !== expected.version) {
		throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
}

function sameSet(expected: string[], actual: string[]): boolean {
	const left = new Set(expected)
	const right = new Set(actual)
	if (left.size !== right.size) return false
	for (const id of left) if (!right.has(id)) return false
	return true
}

async function assertQuestionSet(tx: Tx, testIds: string[], expected: string[]): Promise<void> {
	if (testIds.length === 0) {
		if (expected.length > 0) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		return
	}
	const list = sql.join(
		testIds.map((id) => sql`${id}::uuid`),
		sql`, `
	)
	const result = await tx.execute<IdRow>(sql`SELECT id FROM questions WHERE test_id IN (${list})`)
	if (
		!sameSet(
			expected,
			result.rows.map((row) => row.id)
		)
	) {
		throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
}

async function assertTopicSlugs(tx: Tx, expected: Map<string, string>, mode: 'share' | 'update'): Promise<void> {
	const ids = [...expected.keys()].sort()
	const list = sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `
	)
	const result =
		mode === 'update'
			? await tx.execute<SlugRow>(sql`SELECT id, slug FROM topics WHERE id IN (${list}) ORDER BY id FOR UPDATE`)
			: await tx.execute<SlugRow>(sql`SELECT id, slug FROM topics WHERE id IN (${list}) ORDER BY id FOR SHARE`)
	const actual = new Map(result.rows.map((row) => [row.id, row.slug]))
	for (const [id, slug] of expected) {
		if (actual.get(id) !== slug) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
}

async function questionRowsOf(where: SQL) {
	return db
		.select({
			id: questions.id,
			testId: questions.testId,
			promptPath: questions.promptPath,
			explanationPath: questions.explanationPath,
			testSlug: tests.slug,
		})
		.from(questions)
		.innerJoin(tests, eq(questions.testId, tests.id))
		.where(where)
}

export async function updateTopic(params: { topicId: string; data: TopicUpdateInput }): Promise<TopicRow> {
	const { topicId, data } = params
	const existing = await db.query.topics.findFirst({ where: eq(topics.id, topicId) })
	if (!existing) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const nextSlug = data.slug && data.slug !== existing.slug ? data.slug : null
	if (nextSlug) {
		const slugExists = await db.query.topics.findFirst({ where: eq(topics.slug, nextSlug) })
		if (slugExists) throw new ApiError(409, ERROR_MESSAGES.TOPIC_SLUG_EXISTS)
	}

	if (!nextSlug) {
		const [updated] = await db
			.update(topics)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(topics.id, topicId))
			.returning()
		if (!updated) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
		return updated
	}

	const topicTests = await db.select({ id: tests.id, slug: tests.slug }).from(tests).where(eq(tests.topicId, topicId))
	const rows = await questionRowsOf(eq(tests.topicId, topicId))
	const plan = await planRelocation(
		rows.map((row) => ({ ...row, topicSlug: existing.slug })),
		{ topicSlug: nextSlug }
	)
	const testIds = topicTests.map((test) => test.id).sort()

	return relocateQuestionObjects(plan.pairs, async (tx) => {
		for (const test of [...topicTests].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
			await lockPlannedTest(tx, test.id, { slug: test.slug, topicId })
		}
		await assertTopicSlugs(tx, new Map([[topicId, existing.slug]]), 'update')
		const current = await tx.execute<IdRow>(sql`SELECT id FROM tests WHERE topic_id = ${topicId}`)
		if (
			!sameSet(
				testIds,
				current.rows.map((row) => row.id)
			)
		) {
			throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		}
		await assertQuestionSet(
			tx,
			testIds,
			rows.map((row) => row.id)
		)

		const [updated] = await tx
			.update(topics)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(topics.id, topicId))
			.returning()
			.catch(conflictOnUniqueViolation(ERROR_MESSAGES.TOPIC_SLUG_EXISTS))
		if (!updated) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		await switchPointers(tx, plan.pointers)
		return updated
	})
}

export async function updateTestSettings(params: {
	testId: string
	data: TestSettingsInput
	userId: string | null
}): Promise<{ test: TestRow; topicSlug: string; assetsMoved?: true }> {
	const { testId, data, userId } = params
	const existingTest = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
	if (!existingTest) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)

	const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const relocating = data.slug !== existingTest.slug || data.topicId !== existingTest.topicId
	if (relocating) {
		const slugExists = await db.query.tests.findFirst({
			where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
		})
		if (slugExists && slugExists.id !== testId) throw new ApiError(409, ERROR_MESSAGES.TEST_SLUG_EXISTS)
	}

	const [countRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(questions)
		.where(eq(questions.testId, testId))
	if (data.isPublished && Number(countRow?.count ?? 0) === 0) {
		throw new ApiError(400, PUBLISH_WITHOUT_QUESTIONS_MESSAGE)
	}

	const nextScoringOverride = data.scoringRules === undefined ? existingTest.scoringRules : data.scoringRules
	const shouldIncrementVersion = data.isPublished && !existingTest.isPublished
	const values = {
		topicId: data.topicId,
		slug: data.slug,
		title: data.title,
		description: data.description,
		isPublished: data.isPublished,
		showCorrectAnswer: data.showCorrectAnswer,
		scoringRules: nextScoringOverride ?? null,
		timeLimitMinutes: data.timeLimitMinutes,
		redThresholdMinutes: data.redThresholdMinutes ?? null,
		warningThresholdMinutes: data.warningThresholdMinutes ?? null,
		passingScore: data.passingScore,
		order: data.order,
		version: shouldIncrementVersion ? existingTest.version + 1 : existingTest.version,
		updatedBy: userId,
	}

	if (!relocating) {
		const [updated] = await db
			.update(tests)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(tests.id, testId),
					eq(tests.slug, existingTest.slug),
					eq(tests.topicId, existingTest.topicId),
					eq(tests.version, existingTest.version)
				)
			)
			.returning()
		if (!updated) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		return { test: updated, topicSlug: topic.slug }
	}

	const oldTopic = await db.query.topics.findFirst({ where: eq(topics.id, existingTest.topicId) })
	if (!oldTopic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const rows = await questionRowsOf(eq(questions.testId, testId))
	const plan = await planRelocation(
		rows.map((row) => ({ ...row, topicSlug: oldTopic.slug })),
		{ topicSlug: topic.slug, testSlug: data.slug }
	)
	const topicChanged = data.topicId !== existingTest.topicId

	const test = await relocateQuestionObjects(plan.pairs, async (tx) => {
		await lockPlannedTest(tx, testId, {
			slug: existingTest.slug,
			topicId: existingTest.topicId,
			version: existingTest.version,
		})
		await assertTopicSlugs(
			tx,
			new Map([
				[oldTopic.id, oldTopic.slug],
				[topic.id, topic.slug],
			]),
			'share'
		)
		await assertQuestionSet(
			tx,
			[testId],
			rows.map((row) => row.id)
		)

		const [updated] = await tx
			.update(tests)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(tests.id, testId))
			.returning()
			.catch(conflictOnUniqueViolation(ERROR_MESSAGES.TEST_SLUG_EXISTS))
		if (!updated) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		await switchPointers(tx, plan.pointers)

		if (topicChanged) {
			for (const row of rows) {
				await updateQuestionSearchDocumentLocation({ questionId: row.id, testId, topicId: data.topicId }, tx)
			}
		}
		return updated
	})

	return { test, topicSlug: topic.slug, assetsMoved: true }
}
