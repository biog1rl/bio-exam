import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerKeys, questions, testScoringSettings, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError } from '../../lib/errors.js'
import { parseTestScoringRules, resolveEffectiveScoringRules, type TestScoringRules } from '../../lib/tests/scoring.js'
import type { TestScope } from '../access-policy/scope.js'
import { isServableImageKey } from '../storage/index.js'
import { createCeilingBuffer, streamZip, ZipLimitExceededError, type ZipEntry } from '../storage/zip.js'
import { extractAssetRefs } from './asset-refs.js'
import { questionMarkdownCandidates, testPrefix } from './paths.js'
import { readQuestionTexts, type QuestionTextRequest } from './read.js'

export const ZIP_RESPONSE_LIMIT_BYTES = 4_400_000

export const ARCHIVE_TOO_LARGE_MESSAGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'

export type ArchiveResult = { buffer: Buffer; filename: string }

export type PreparedArchive = { entries: ZipEntry[]; missing: string[]; filename: string }

type TestRow = typeof tests.$inferSelect
type TopicRow = typeof topics.$inferSelect
type QuestionRow = typeof questions.$inferSelect

type LoadedTest = { test: TestRow; questions: QuestionRow[] }

type TestParts = {
	entries: ZipEntry[]
	ownAssets: ZipEntry[]
	sharedAssetKeys: string[]
	missing: string[]
}

const MARKDOWN_FILES = [
	{ fileName: 'prompt.md', pointer: (q: QuestionRow) => q.promptPath },
	{ fileName: 'explanation.md', pointer: (q: QuestionRow) => q.explanationPath },
] as const

function isExportableAsset(key: string): boolean {
	return isServableImageKey(key) && !key.startsWith('avatars/')
}

function jsonBuffer(value: unknown): Buffer {
	return Buffer.from(JSON.stringify(value, null, 2))
}

function byName(a: ZipEntry, b: ZipEntry): number {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

async function loadGlobalRules(): Promise<TestScoringRules> {
	const row = await db.query.testScoringSettings.findFirst({ where: eq(testScoringSettings.id, 'global') })
	return parseTestScoringRules(row?.rules)
}

async function loadTests(testRows: TestRow[]): Promise<LoadedTest[]> {
	if (testRows.length === 0) return []
	const rows = await db
		.select()
		.from(questions)
		.where(
			inArray(
				questions.testId,
				testRows.map((test) => test.id)
			)
		)
		.orderBy(asc(questions.order), asc(questions.id))
	const byTest = new Map<string, QuestionRow[]>(testRows.map((test) => [test.id, []]))
	for (const row of rows) byTest.get(row.testId)?.push(row)
	return testRows.map((test) => ({ test, questions: byTest.get(test.id) ?? [] }))
}

async function loadAnswerKeys(loaded: LoadedTest[]): Promise<Map<string, unknown>> {
	const ids = loaded.flatMap((item) => item.questions.map((q) => q.id))
	const rows =
		ids.length > 0
			? await db
					.select({ questionId: answerKeys.questionId, correct: answerKeys.correctAnswer })
					.from(answerKeys)
					.where(and(inArray(answerKeys.questionId, ids), eq(answerKeys.isActive, true)))
			: []
	return new Map(rows.map((row) => [row.questionId, row.correct]))
}

function settingsEntry(test: TestRow, globalRules: TestScoringRules): Buffer {
	return jsonBuffer({
		id: test.id,
		title: test.title,
		description: test.description,
		isPublished: test.isPublished,
		showCorrectAnswer: test.showCorrectAnswer,
		scoringRules: resolveEffectiveScoringRules({ globalRules, testOverrideRules: test.scoringRules }),
		useGlobalScoringRules: test.scoringRules == null,
		timeLimitMinutes: test.timeLimitMinutes,
		redThresholdMinutes: test.redThresholdMinutes,
		warningThresholdMinutes: test.warningThresholdMinutes,
		passingScore: test.passingScore,
		version: test.version,
		updatedAt: test.updatedAt.toISOString(),
	})
}

function answerKeysEntry(questionRows: QuestionRow[], byQuestion: Map<string, unknown>): Buffer {
	return jsonBuffer(
		questionRows.filter((q) => byQuestion.has(q.id)).map((q) => ({ questionId: q.id, correct: byQuestion.get(q.id) }))
	)
}

function markdownRequests(topic: TopicRow, loaded: LoadedTest[]): QuestionTextRequest[] {
	const requests: QuestionTextRequest[] = []
	for (const { test, questions: questionRows } of loaded) {
		for (const question of questionRows) {
			for (const file of MARKDOWN_FILES) {
				requests.push({
					candidates: questionMarkdownCandidates({
						storedPath: file.pointer(question),
						topicSlug: topic.slug,
						testSlug: test.slug,
						testId: test.id,
						questionId: question.id,
						fileName: file.fileName,
					}),
				})
			}
		}
	}
	return requests
}

async function collectParts(
	topic: TopicRow,
	loaded: LoadedTest[],
	withAnswers: boolean,
	globalRules: TestScoringRules
): Promise<TestParts[]> {
	const [texts, keys] = await Promise.all([
		readQuestionTexts(markdownRequests(topic, loaded)),
		withAnswers ? loadAnswerKeys(loaded) : Promise.resolve(null),
	])
	let cursor = 0
	return loaded.map(({ test, questions: questionRows }) => {
		const entries: ZipEntry[] = [{ name: 'settings.json', buffer: settingsEntry(test, globalRules) }]
		if (keys) entries.push({ name: 'answer_keys.json', buffer: answerKeysEntry(questionRows, keys) })

		const missing: string[] = []
		const refs = new Set<string>()
		for (const question of questionRows) {
			for (const file of MARKDOWN_FILES) {
				const text = texts[cursor] ?? ''
				cursor += 1
				if (text === '') {
					const pointer = file.pointer(question)
					if (pointer) missing.push(pointer)
					continue
				}
				entries.push({ name: `questions/${question.id}/${file.fileName}`, buffer: Buffer.from(text) })
				for (const key of extractAssetRefs(text)) if (isExportableAsset(key)) refs.add(key)
			}
		}

		const ownPrefix = `${testPrefix(topic.slug, test.slug)}/`
		const ownAssets: ZipEntry[] = []
		const sharedAssetKeys: string[] = []
		for (const key of refs) {
			const relative = key.startsWith(ownPrefix) ? key.slice(ownPrefix.length) : null
			if (relative !== null && relative.startsWith('assets/')) ownAssets.push({ name: relative, key })
			else sharedAssetKeys.push(key)
		}
		ownAssets.sort(byName)
		return { entries, ownAssets, sharedAssetKeys, missing }
	})
}

function sharedAssetEntries(keys: Iterable<string>): ZipEntry[] {
	return [...new Set(keys)].map((key) => ({ name: key, key })).sort(byName)
}

function withBase(base: string, entry: ZipEntry): ZipEntry {
	return 'key' in entry
		? { name: `${base}/${entry.name}`, key: entry.key }
		: { name: `${base}/${entry.name}`, buffer: entry.buffer }
}

export async function prepareTestArchive(params: { testId: string; withAnswers: boolean }): Promise<PreparedArchive> {
	const { testId, withAnswers } = params
	const [row] = await db
		.select({ test: tests, topic: topics })
		.from(tests)
		.leftJoin(topics, eq(topics.id, tests.topicId))
		.where(eq(tests.id, testId))
		.limit(1)
	if (!row) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	const { test, topic } = row
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const [globalRules, loaded] = await Promise.all([loadGlobalRules(), loadTests([test])])
	const parts = (await collectParts(topic, loaded, withAnswers, globalRules))[0] as TestParts
	const entries = [...parts.entries, ...[...parts.ownAssets, ...sharedAssetEntries(parts.sharedAssetKeys)].sort(byName)]
	return { entries, missing: parts.missing, filename: `${topic.slug}-${test.slug}.zip` }
}

export async function prepareTopicArchive(params: {
	topicSlug: string
	withAnswers: boolean
	scope: TestScope
	answersAllowed?: (topicId: string) => Promise<boolean>
}): Promise<PreparedArchive> {
	const { topicSlug, scope, answersAllowed } = params
	const topic = await db.query.topics.findFirst({ where: eq(topics.slug, topicSlug) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	if (!scope.all && !scope.topicIds.includes(topic.id)) throw new ApiError(403, 'Forbidden')
	const withAnswers = params.withAnswers && (answersAllowed ? await answersAllowed(topic.id) : true)

	const [topicTests, globalRules] = await Promise.all([
		db.select().from(tests).where(eq(tests.topicId, topic.id)).orderBy(asc(tests.order), asc(tests.slug)),
		loadGlobalRules(),
	])
	const loaded = await loadTests(topicTests)
	const allParts = await collectParts(topic, loaded, withAnswers, globalRules)

	const entries: ZipEntry[] = []
	const missing: string[] = []
	const shared: string[] = []
	allParts.forEach((parts, index) => {
		const base = (loaded[index] as LoadedTest).test.slug
		for (const entry of [...parts.entries, ...parts.ownAssets]) entries.push(withBase(base, entry))
		missing.push(...parts.missing)
		shared.push(...parts.sharedAssetKeys)
	})
	entries.push(...sharedAssetEntries(shared))
	return { entries, missing, filename: `${topic.slug}.zip` }
}

export async function streamArchive(
	prepared: PreparedArchive,
	sink: NodeJS.WritableStream,
	options: { signal?: AbortSignal } = {}
): Promise<void> {
	await streamZip(prepared.entries, sink, { missing: [...prepared.missing], signal: options.signal })
}

export async function archiveToBuffer(prepared: PreparedArchive, limitBytes: number): Promise<Buffer> {
	const ceiling = createCeilingBuffer(limitBytes)
	try {
		await streamZip(prepared.entries, ceiling.writable, { missing: [...prepared.missing] })
	} catch (error) {
		if (error instanceof ZipLimitExceededError) throw new ApiError(413, ARCHIVE_TOO_LARGE_MESSAGE)
		throw error
	}
	return ceiling.buffer()
}

export async function buildTestArchive(params: {
	testId: string
	withAnswers: boolean
	limitBytes?: number
}): Promise<ArchiveResult> {
	const prepared = await prepareTestArchive({ testId: params.testId, withAnswers: params.withAnswers })
	const buffer = await archiveToBuffer(prepared, params.limitBytes ?? ZIP_RESPONSE_LIMIT_BYTES)
	return { buffer, filename: prepared.filename }
}

export async function buildTopicArchive(params: {
	topicSlug: string
	withAnswers: boolean
	scope: TestScope
	answersAllowed?: (topicId: string) => Promise<boolean>
	limitBytes?: number
}): Promise<ArchiveResult> {
	const { limitBytes, ...prepareParams } = params
	const prepared = await prepareTopicArchive(prepareParams)
	const buffer = await archiveToBuffer(prepared, limitBytes ?? ZIP_RESPONSE_LIMIT_BYTES)
	return { buffer, filename: prepared.filename }
}
