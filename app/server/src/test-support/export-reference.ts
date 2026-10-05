import archiver from 'archiver'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../db/index.js'
import { answerKeys, questions, testScoringSettings, tests, topics } from '../db/schema.js'
import { ERROR_MESSAGES } from '../lib/constants.js'
import { ApiError } from '../lib/errors.js'
import { parseTestScoringRules, resolveEffectiveScoringRules, type TestScoringRules } from '../lib/tests/scoring.js'
import type { TestScope } from '../services/access-policy/scope.js'
import { extractAssetRefs } from '../services/question-content/asset-refs.js'
import { questionMarkdownCandidates, testPrefix } from '../services/question-content/paths.js'
import { findFirstMarkdown } from '../services/question-content/read.js'
import { isServableImageKey, storage } from '../services/storage/index.js'
import { MISSING_FILES_ENTRY, ZipEntryNameError, type ZipEntry } from '../services/storage/zip.js'

export type BuildZipOptions = { missing?: string[] }

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if (code < 0x20 || code === 0x7f) return true
	}
	return false
}

function assertEntryName(name: string): void {
	if (typeof name !== 'string' || name === '' || name.startsWith('/')) throw new ZipEntryNameError(name)
	if (name.includes('\\') || hasControlCharacter(name)) throw new ZipEntryNameError(name)
	for (const segment of name.split('/')) {
		if (segment === '' || segment === '.' || segment === '..') throw new ZipEntryNameError(name)
	}
}

function assertEntryNames(entries: ZipEntry[]): void {
	const names = new Set<string>([MISSING_FILES_ENTRY])
	for (const entry of entries) {
		assertEntryName(entry.name)
		if (names.has(entry.name)) throw new ZipEntryNameError(entry.name)
		names.add(entry.name)
	}
}

function packZip(files: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const archive = archiver('zip', { zlib: { level: 9 } })
		const chunks: Buffer[] = []
		archive.on('data', (chunk: Buffer) => chunks.push(chunk))
		archive.on('end', () => resolve(Buffer.concat(chunks)))
		archive.on('warning', reject)
		archive.on('error', reject)
		for (const file of files) archive.append(file.data, { name: file.name })
		void archive.finalize()
	})
}

export async function buildZip(entries: ZipEntry[], options: BuildZipOptions = {}): Promise<Buffer> {
	assertEntryNames(entries)
	const missing = options.missing ?? []
	const files: Array<{ name: string; data: Buffer }> = []
	let module: ReturnType<typeof storage> | null = null
	for (const entry of entries) {
		if ('buffer' in entry) {
			files.push({ name: entry.name, data: entry.buffer })
			continue
		}
		module ??= storage()
		const result = await module.read(entry.key)
		if (result === null) missing.push(entry.key)
		else files.push({ name: entry.name, data: result.data })
	}
	if (missing.length > 0) files.push({ name: MISSING_FILES_ENTRY, data: Buffer.from(`${missing.join('\n')}\n`) })
	return packZip(files)
}

export const ZIP_RESPONSE_LIMIT_BYTES = 4_400_000

export const ARCHIVE_TOO_LARGE_MESSAGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'

export type ArchiveResult = { buffer: Buffer; filename: string }

type TestRow = typeof tests.$inferSelect
type TopicRow = typeof topics.$inferSelect
type QuestionRow = typeof questions.$inferSelect

function isExportableAsset(key: string): boolean {
	return isServableImageKey(key) && !key.startsWith('avatars/')
}

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

export function assertArchiveFits(buffer: Buffer, limitBytes: number): void {
	if (buffer.length > limitBytes) throw new ApiError(413, ARCHIVE_TOO_LARGE_MESSAGE)
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

async function answerKeysEntry(questionRows: QuestionRow[]): Promise<Buffer> {
	const ids = questionRows.map((q) => q.id)
	const rows =
		ids.length > 0
			? await db
					.select({ questionId: answerKeys.questionId, correct: answerKeys.correctAnswer })
					.from(answerKeys)
					.where(and(inArray(answerKeys.questionId, ids), eq(answerKeys.isActive, true)))
			: []
	const byQuestion = new Map(rows.map((row) => [row.questionId, row.correct]))
	return jsonBuffer(
		questionRows.filter((q) => byQuestion.has(q.id)).map((q) => ({ questionId: q.id, correct: byQuestion.get(q.id) }))
	)
}

async function collectTestParts(
	test: TestRow,
	topic: TopicRow,
	withAnswers: boolean,
	globalRules: TestScoringRules
): Promise<TestParts> {
	const questionRows = await db
		.select()
		.from(questions)
		.where(eq(questions.testId, test.id))
		.orderBy(asc(questions.order), asc(questions.id))

	const entries: ZipEntry[] = [{ name: 'settings.json', buffer: settingsEntry(test, globalRules) }]
	if (withAnswers) entries.push({ name: 'answer_keys.json', buffer: await answerKeysEntry(questionRows) })

	const missing: string[] = []
	const refs = new Set<string>()
	for (const question of questionRows) {
		for (const file of MARKDOWN_FILES) {
			const pointer = file.pointer(question)
			const found = await findFirstMarkdown(
				questionMarkdownCandidates({
					storedPath: pointer,
					topicSlug: topic.slug,
					testSlug: test.slug,
					testId: test.id,
					questionId: question.id,
					fileName: file.fileName,
				})
			)
			if (found === null) {
				if (pointer) missing.push(pointer)
				continue
			}
			entries.push({ name: `questions/${question.id}/${file.fileName}`, buffer: Buffer.from(found.text) })
			for (const key of extractAssetRefs(found.text)) if (isExportableAsset(key)) refs.add(key)
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
}

function sharedAssetEntries(keys: Iterable<string>): ZipEntry[] {
	return [...new Set(keys)].map((key) => ({ name: key, key })).sort(byName)
}

function withBase(base: string, entry: ZipEntry): ZipEntry {
	return 'key' in entry
		? { name: `${base}/${entry.name}`, key: entry.key }
		: { name: `${base}/${entry.name}`, buffer: entry.buffer }
}

export async function referenceBuildTestArchive(params: {
	testId: string
	withAnswers: boolean
	limitBytes?: number
}): Promise<ArchiveResult> {
	const { testId, withAnswers, limitBytes = ZIP_RESPONSE_LIMIT_BYTES } = params
	const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
	if (!test) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const parts = await collectTestParts(test, topic, withAnswers, await loadGlobalRules())
	const entries = [...parts.entries, ...[...parts.ownAssets, ...sharedAssetEntries(parts.sharedAssetKeys)].sort(byName)]
	const buffer = await buildZip(entries, { missing: parts.missing })
	assertArchiveFits(buffer, limitBytes)
	return { buffer, filename: `${topic.slug}-${test.slug}.zip` }
}

export async function referenceBuildTopicArchive(params: {
	topicSlug: string
	withAnswers: boolean
	scope: TestScope
	answersAllowed?: (topicId: string) => Promise<boolean>
	limitBytes?: number
}): Promise<ArchiveResult> {
	const { topicSlug, scope, answersAllowed, limitBytes = ZIP_RESPONSE_LIMIT_BYTES } = params
	const topic = await db.query.topics.findFirst({ where: eq(topics.slug, topicSlug) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	if (!scope.all && !scope.topicIds.includes(topic.id)) throw new ApiError(403, 'Forbidden')
	const withAnswers = params.withAnswers && (answersAllowed ? await answersAllowed(topic.id) : true)

	const topicTests = await db
		.select()
		.from(tests)
		.where(eq(tests.topicId, topic.id))
		.orderBy(asc(tests.order), asc(tests.slug))
	const globalRules = await loadGlobalRules()

	const entries: ZipEntry[] = []
	const missing: string[] = []
	const shared: string[] = []
	for (const test of topicTests) {
		const parts = await collectTestParts(test, topic, withAnswers, globalRules)
		for (const entry of [...parts.entries, ...parts.ownAssets]) entries.push(withBase(test.slug, entry))
		missing.push(...parts.missing)
		shared.push(...parts.sharedAssetKeys)
	}
	entries.push(...sharedAssetEntries(shared))

	const buffer = await buildZip(entries, { missing })
	assertArchiveFits(buffer, limitBytes)
	return { buffer, filename: `${topic.slug}.zip` }
}
