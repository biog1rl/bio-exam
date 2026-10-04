import { STAFF_ROLE_KEYS } from '@bio-exam/rbac'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, testAttempts, tests, topics, userRoles } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError } from '../../lib/errors.js'
import { StorageKeyError, normalizeKey, storage } from '../storage/index.js'
import { lockTest, resequenceQuestions, type Tx } from './order.js'
import { questionPrefix, testPrefix, topicPrefix } from './paths.js'
import { CONTENT_CHANGED_MESSAGE, QUESTION_NOT_IN_TEST_MESSAGE } from './write.js'

export const REORDER_SET_MISMATCH_MESSAGE = 'Неверный набор вопросов для сортировки'

const TEST_HAS_STUDENT_ATTEMPTS_MESSAGE =
	'У теста есть попытки учеников. Снимите публикацию или обратитесь к администратору'

export type ContentScope = { kind: 'question' | 'test' | 'topic'; prefix: string }

export type PointerRow = { promptPath: string | null; explanationPath: string | null }

const ORPHAN_LOG_PREFIX = '[question-content] orphan objects'

const SAVED_JSON = new Set(['settings.json', 'answer_keys.json'])

type PointerDbRow = { prompt_path: string | null; explanation_path: string | null }

type KeyRow = { key: string }

type SlugRow = { slug: string }

type IdRow = { id: string }

const CONTENT_NAMESPACE = 'topics/'

function isProtected(key: string): boolean {
	if (!key.startsWith(CONTENT_NAMESPACE)) return true
	return key.split('/')[3] === 'assets'
}

function isValidKey(key: string): boolean {
	try {
		normalizeKey(key)
		return true
	} catch {
		return false
	}
}

function testContentPath(segments: string[]): boolean {
	if (segments.length === 1) return SAVED_JSON.has(segments[0] ?? '')
	return segments[0] === 'questions' && segments.length >= 2
}

function inScope(key: string, scope: ContentScope): boolean {
	if (!key.startsWith(`${scope.prefix}/`)) return false
	if (isProtected(key)) return false
	const segments = key.slice(scope.prefix.length + 1).split('/')
	if (scope.kind === 'question') return true
	if (scope.kind === 'test') return testContentPath(segments)
	return segments.length >= 2 && testContentPath(segments.slice(1))
}

function pointerKeys(rows: PointerRow[]): string[] {
	return rows
		.flatMap((row) => [row.promptPath, row.explanationPath])
		.filter((key): key is string => typeof key === 'string' && key.length > 0 && !isProtected(key) && isValidKey(key))
}

async function listedKeys(scope: ContentScope): Promise<string[]> {
	try {
		const objects = await storage().list(scope.prefix, { recursive: true })
		return objects.map((object) => object.key).filter((key) => inScope(key, scope))
	} catch (error) {
		if (error instanceof StorageKeyError) return []
		throw error
	}
}

export async function collectContentKeys(rows: PointerRow[], scope: ContentScope): Promise<string[]> {
	const listed = await listedKeys(scope)
	return [...new Set([...listed, ...pointerKeys(rows)])]
}

async function removeContentObjects(keys: string[]): Promise<boolean> {
	if (keys.length === 0) return true
	try {
		await storage().remove(keys)
		return true
	} catch {
		console.warn(ORPHAN_LOG_PREFIX, keys)
		return false
	}
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
	return unique.filter((key) => !used.has(key))
}

function toPointers(rows: PointerDbRow[]): PointerRow[] {
	return rows.map((row) => ({ promptPath: row.prompt_path, explanationPath: row.explanation_path }))
}

async function topicSlugOf(tx: Tx, topicId: string, lock: 'share' | 'update'): Promise<string | null> {
	const result =
		lock === 'update'
			? await tx.execute<SlugRow>(sql`SELECT slug FROM topics WHERE id = ${topicId} FOR UPDATE`)
			: await tx.execute<SlugRow>(sql`SELECT slug FROM topics WHERE id = ${topicId} FOR SHARE`)
	return result.rows[0]?.slug ?? null
}

async function loadTestLocation(testId: string) {
	const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
	if (!test) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	return { test, topic }
}

async function lockTestAt(tx: Tx, testId: string, expected: { slug: string; topicId: string; topicSlug: string }) {
	const locked = await lockTest(tx, testId)
	if (locked.slug !== expected.slug || locked.topicId !== expected.topicId) {
		throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
	const topicSlug = await topicSlugOf(tx, locked.topicId, 'share')
	if (topicSlug !== expected.topicSlug) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	return locked
}

export async function deleteQuestion(params: {
	testId: string
	questionId: string
	userId: string | null
}): Promise<{ assetsDeleted: boolean }> {
	const { testId, questionId, userId } = params
	const { test, topic } = await loadTestLocation(testId)
	const existing = await db.query.questions.findFirst({
		where: and(eq(questions.id, questionId), eq(questions.testId, testId)),
		columns: { id: true },
	})
	if (!existing) throw new ApiError(404, QUESTION_NOT_IN_TEST_MESSAGE)

	const listed = await collectContentKeys([], {
		kind: 'question',
		prefix: questionPrefix(topic.slug, test.slug, questionId),
	})

	const keys = await db.transaction(async (tx) => {
		await lockTestAt(tx, testId, { slug: test.slug, topicId: test.topicId, topicSlug: topic.slug })
		const removed = await tx.execute<PointerDbRow>(sql`
			DELETE FROM questions WHERE id = ${questionId} AND test_id = ${testId}
			RETURNING prompt_path, explanation_path
		`)
		if (removed.rows.length === 0) throw new ApiError(404, QUESTION_NOT_IN_TEST_MESSAGE)
		await resequenceQuestions(tx, testId)
		await tx.update(tests).set({ updatedAt: new Date(), updatedBy: userId }).where(eq(tests.id, testId))
		return unreferencedKeys(tx, [...listed, ...pointerKeys(toPointers(removed.rows))])
	})

	const assetsDeleted = await removeContentObjects(keys)
	return { assetsDeleted }
}

async function hasStudentAttempts(tx: Tx, testId: string): Promise<boolean> {
	const [row] = await tx
		.select({ id: testAttempts.id })
		.from(testAttempts)
		.where(
			and(
				eq(testAttempts.testId, testId),
				sql`not exists (select 1 from ${userRoles} where ${userRoles.userId} = ${testAttempts.userId} and ${inArray(userRoles.roleKey, [...STAFF_ROLE_KEYS])})`
			)
		)
		.limit(1)
	return Boolean(row)
}

export async function deleteTest(params: {
	testId: string
	refuseWithAttempts?: boolean
}): Promise<{ assetsDeleted: boolean }> {
	const { testId, refuseWithAttempts = false } = params
	const { test, topic } = await loadTestLocation(testId)
	const listed = await collectContentKeys([], { kind: 'test', prefix: testPrefix(topic.slug, test.slug) })

	const keys = await db.transaction(async (tx) => {
		await lockTestAt(tx, testId, { slug: test.slug, topicId: test.topicId, topicSlug: topic.slug })
		if (refuseWithAttempts && (await hasStudentAttempts(tx, testId))) {
			throw new ApiError(409, TEST_HAS_STUDENT_ATTEMPTS_MESSAGE)
		}
		const pointers = await tx.execute<PointerDbRow>(sql`
			SELECT prompt_path, explanation_path FROM questions WHERE test_id = ${testId}
		`)
		const removed = await tx.execute<IdRow>(sql`DELETE FROM tests WHERE id = ${testId} RETURNING id`)
		if (removed.rows.length === 0) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
		return unreferencedKeys(tx, [...listed, ...pointerKeys(toPointers(pointers.rows))])
	})

	const assetsDeleted = await removeContentObjects(keys)
	return { assetsDeleted }
}

export async function deleteTopic(params: { topicId: string }): Promise<{ assetsDeleted: boolean }> {
	const { topicId } = params
	const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	const listed = await collectContentKeys([], { kind: 'topic', prefix: topicPrefix(topic.slug) })

	const keys = await db.transaction(async (tx) => {
		const topicTests = await tx.execute<IdRow>(sql`SELECT id FROM tests WHERE topic_id = ${topicId} ORDER BY id`)
		for (const row of topicTests.rows) await lockTest(tx, row.id)
		const slug = await topicSlugOf(tx, topicId, 'update')
		if (slug === null) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
		if (slug !== topic.slug) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		const pointers = await tx.execute<PointerDbRow>(sql`
			SELECT q.prompt_path, q.explanation_path
			FROM questions q
			JOIN tests t ON t.id = q.test_id
			WHERE t.topic_id = ${topicId}
		`)
		const removed = await tx.execute<IdRow>(sql`DELETE FROM topics WHERE id = ${topicId} RETURNING id`)
		if (removed.rows.length === 0) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
		return unreferencedKeys(tx, [...listed, ...pointerKeys(toPointers(pointers.rows))])
	})

	const assetsDeleted = await removeContentObjects(keys)
	return { assetsDeleted }
}

export async function reorderQuestions(params: {
	testId: string
	questionIds: string[]
	userId: string | null
}): Promise<{ order: string[] }> {
	const { testId, questionIds, userId } = params
	return db.transaction(async (tx) => {
		await lockTest(tx, testId)
		const current = await tx.execute<IdRow>(sql`SELECT id FROM questions WHERE test_id = ${testId}`)
		const existing = new Set(current.rows.map((row) => row.id))
		const requested = new Set(questionIds)
		if (
			requested.size !== questionIds.length ||
			existing.size !== requested.size ||
			!questionIds.every((id) => existing.has(id))
		) {
			throw new ApiError(400, REORDER_SET_MISMATCH_MESSAGE)
		}
		const order = await resequenceQuestions(tx, testId, () => [...questionIds])
		await tx.update(tests).set({ updatedAt: new Date(), updatedBy: userId }).where(eq(tests.id, testId))
		return { order }
	})
}
