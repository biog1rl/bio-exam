import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, tests, topics } from '../../db/schema.js'
import { storage, StorageKeyError, type StorageObject } from '../storage/index.js'
import { questionMarkdownCandidates, type QuestionMarkdownFileName } from './paths.js'

export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000

export type ReconcileOptions = {
	deleteOrphans?: boolean
	deleteLegacyJson?: boolean
	minAgeMs?: number
	now?: () => number
}

export type ReconcileMissingPointer = {
	questionId: string
	kind: 'prompt' | 'explanation'
	key: string
}

export type ReconcileReport = {
	orphans: string[]
	recentOrphans: string[]
	missingPointers: ReconcileMissingPointer[]
	legacyJson: string[]
	assetsCount: number
	unknown: string[]
	deleted: { orphans: string[]; legacyJson: string[] }
}

type QuestionLocation = {
	questionId: string
	testId: string
	testSlug: string
	topicSlug: string
	promptPath: string | null
	explanationPath: string | null
}

type ContentRead = {
	locations: QuestionLocation[]
	candidates: Set<string>
}

const MARKDOWN_FILES: ReadonlyArray<{
	kind: ReconcileMissingPointer['kind']
	fileName: QuestionMarkdownFileName
	pointer: (row: QuestionLocation) => string | null
}> = [
	{ kind: 'prompt', fileName: 'prompt.md', pointer: (row) => row.promptPath },
	{ kind: 'explanation', fileName: 'explanation.md', pointer: (row) => row.explanationPath },
]

const QUESTION_MARKDOWN_KEY = /^topics\/[^/]+\/[^/]+\/questions\/[^/]+\/[^/]+\.md$/
const LEGACY_JSON_KEY = /^topics\/[^/]+\/[^/]+\/(?:answer_keys|settings)\.json$/
const TEST_ASSET_KEY = /^topics\/[^/]+\/[^/]+\/assets\/./

function candidatesOf(row: QuestionLocation, file: (typeof MARKDOWN_FILES)[number]): string[] {
	return questionMarkdownCandidates({
		storedPath: file.pointer(row),
		topicSlug: row.topicSlug,
		testSlug: row.testSlug,
		testId: row.testId,
		questionId: row.questionId,
		fileName: file.fileName,
	})
}

async function readContent(): Promise<ContentRead> {
	const locations = await db
		.select({
			questionId: questions.id,
			testId: questions.testId,
			testSlug: tests.slug,
			topicSlug: topics.slug,
			promptPath: questions.promptPath,
			explanationPath: questions.explanationPath,
		})
		.from(questions)
		.innerJoin(tests, eq(tests.id, questions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
	const candidates = new Set<string>()
	for (const row of locations) {
		for (const file of MARKDOWN_FILES) {
			for (const key of candidatesOf(row, file)) candidates.add(key)
		}
	}
	return { locations, candidates }
}

function isRecent(object: StorageObject, minAgeMs: number, nowMs: number): boolean {
	if (minAgeMs <= 0) return false
	const created = Date.parse(object.createdAt)
	if (Number.isNaN(created)) return true
	return nowMs - created < minAgeMs
}

async function findMissingPointers(
	locations: QuestionLocation[],
	listed: Set<string>
): Promise<ReconcileMissingPointer[]> {
	const module = storage()
	const known = new Map<string, boolean>()
	const exists = async (key: string): Promise<boolean> => {
		if (key.startsWith('topics/')) return listed.has(key)
		let found = known.get(key)
		if (found === undefined) {
			try {
				found = await module.exists(key)
			} catch (error) {
				if (!(error instanceof StorageKeyError)) throw error
				found = false
			}
			known.set(key, found)
		}
		return found
	}
	const missing: ReconcileMissingPointer[] = []
	for (const row of locations) {
		for (const file of MARKDOWN_FILES) {
			const pointer = file.pointer(row)
			if (!pointer) continue
			let found = false
			for (const key of candidatesOf(row, file)) {
				if (await exists(key)) {
					found = true
					break
				}
			}
			if (!found) missing.push({ questionId: row.questionId, kind: file.kind, key: pointer })
		}
	}
	return missing
}

export async function reconcileStorage(options: ReconcileOptions = {}): Promise<ReconcileReport> {
	const {
		deleteOrphans = false,
		deleteLegacyJson = false,
		minAgeMs = ORPHAN_MIN_AGE_MS,
		now = () => Date.now(),
	} = options
	const nowMs = now()
	const content = await readContent()
	const module = storage()
	const objects = await module.list('topics', { recursive: true })

	const report: ReconcileReport = {
		orphans: [],
		recentOrphans: [],
		missingPointers: [],
		legacyJson: [],
		assetsCount: 0,
		unknown: [],
		deleted: { orphans: [], legacyJson: [] },
	}

	for (const object of objects) {
		const { key } = object
		if (QUESTION_MARKDOWN_KEY.test(key)) {
			if (content.candidates.has(key)) continue
			if (isRecent(object, minAgeMs, nowMs)) report.recentOrphans.push(key)
			else report.orphans.push(key)
		} else if (LEGACY_JSON_KEY.test(key)) {
			report.legacyJson.push(key)
		} else if (TEST_ASSET_KEY.test(key)) {
			report.assetsCount += 1
		} else if (!content.candidates.has(key)) {
			report.unknown.push(key)
		}
	}

	report.orphans.sort()
	report.recentOrphans.sort()
	report.legacyJson.sort()
	report.unknown.sort()
	report.missingPointers = await findMissingPointers(content.locations, new Set(objects.map((object) => object.key)))

	if (deleteOrphans && report.orphans.length > 0) {
		const fresh = await readContent()
		const removable = report.orphans.filter((key) => !fresh.candidates.has(key))
		if (removable.length > 0) await module.remove(removable)
		report.deleted.orphans = removable
	}

	if (deleteLegacyJson && report.legacyJson.length > 0) {
		await module.remove(report.legacyJson)
		report.deleted.legacyJson = [...report.legacyJson]
	}

	return report
}
