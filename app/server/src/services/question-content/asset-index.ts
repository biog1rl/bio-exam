import { asc, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, tests, topics } from '../../db/schema.js'
import { escapeLike } from '../../lib/sql-like.js'
import { isServableImageKey, storage } from '../storage/index.js'
import { extractAssetLinks, extractAssetRefs, type AssetLink, type AssetLinkForm } from './asset-refs.js'
import type { Tx } from './order.js'
import { questionMarkdownCandidates } from './paths.js'
import { findFirstMarkdown } from './read.js'

export type AssetIndexExecutor = typeof db | Tx

export type AssetUsage = { questions: number; drafts: number }

export type QuestionAssetLink = AssetLink & { questionId: string }

export type QuestionAssetRef = { questionId: string; key: string; src: string }

export type MissingPointer = { questionId: string; kind: 'prompt' | 'explanation'; key: string }

export type AssetInventory = {
	questions: number
	links: QuestionAssetLink[]
	byForm: Record<AssetLinkForm, number>
	byNamespace: Record<string, number>
	outsideNamespaces: QuestionAssetRef[]
	nonServable: QuestionAssetRef[]
	invalid: Array<{ questionId: string; src: string }>
	missingObjects: QuestionAssetRef[]
	missingPointers: MissingPointer[]
}

export type AssetBackfillResult = { processed: number; indexed: number; skipped: number; failed: number }

type CompleteRow = { complete: boolean }

type MarkerRow = { assets_indexed: boolean }

type QuestionLocation = {
	questionId: string
	testId: string
	testSlug: string
	topicSlug: string
	promptPath: string | null
	explanationPath: string | null
}

const ASSET_LINK_FORMS: AssetLinkForm[] = [
	'key',
	'supabase-public',
	'supabase-sign',
	'uploads-images',
	'uploads-tests',
	'uploads-other',
	'proxy-url',
	'external',
	'invalid',
]

const MARKDOWN_FILES = [
	{ kind: 'prompt', fileName: 'prompt.md', pointer: (row: QuestionLocation) => row.promptPath },
	{ kind: 'explanation', fileName: 'explanation.md', pointer: (row: QuestionLocation) => row.explanationPath },
] as const

const TEST_ASSET_KEY = /^topics\/[^/]+\/[^/]+\/assets\/./

function collectKeys(texts: Array<string | null | undefined>): string[] {
	const keys = new Set<string>()
	for (const text of texts) {
		for (const key of extractAssetRefs(text)) keys.add(key)
	}
	return [...keys].sort()
}

async function insertRefs(executor: AssetIndexExecutor, questionId: string, keys: string[]): Promise<void> {
	if (keys.length === 0) return
	const values = sql.join(
		keys.map((key) => sql`(${questionId}, ${key})`),
		sql`, `
	)
	await executor.execute(sql`
		INSERT INTO question_asset_refs (question_id, asset_key) VALUES ${values}
		ON CONFLICT DO NOTHING
	`)
}

export async function lockAssetKey(executor: AssetIndexExecutor, key: string): Promise<void> {
	await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
}

export async function indexQuestionAssets(
	tx: Tx,
	questionId: string,
	texts: Array<string | null | undefined>
): Promise<string[]> {
	const keys = collectKeys(texts)
	for (const key of keys) await lockAssetKey(tx, key)
	await tx.execute(sql`DELETE FROM question_asset_refs WHERE question_id = ${questionId}`)
	await insertRefs(tx, questionId, keys)
	await tx.execute(sql`UPDATE questions SET assets_indexed = true WHERE id = ${questionId}`)
	return keys
}

export async function isAssetIndexComplete(executor: AssetIndexExecutor = db): Promise<boolean> {
	const result = await executor.execute<CompleteRow>(
		sql`SELECT NOT EXISTS (SELECT 1 FROM questions WHERE NOT assets_indexed) AS complete`
	)
	return result.rows[0]?.complete === true
}

export async function assetUsage(key: string, executor: AssetIndexExecutor = db): Promise<AssetUsage> {
	const pattern = `%${escapeLike(key)}%`
	const result = await executor.execute<{ questions: number; drafts: number }>(sql`
		SELECT
			(SELECT count(DISTINCT question_id)::int FROM question_asset_refs WHERE asset_key = ${key}) AS questions,
			(SELECT count(*)::int FROM question_drafts WHERE payload::text LIKE ${pattern} ESCAPE '\\') AS drafts
	`)
	const row = result.rows[0]
	return { questions: Number(row?.questions ?? 0), drafts: Number(row?.drafts ?? 0) }
}

function isInsideNamespaces(key: string): boolean {
	return key.startsWith('images/') || key.startsWith('avatars/') || TEST_ASSET_KEY.test(key)
}

function selectLocations(onlyUnindexed: boolean) {
	const query = db
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
	const filtered = onlyUnindexed ? query.where(eq(questions.assetsIndexed, false)) : query
	return filtered.orderBy(asc(questions.createdAt), asc(questions.id))
}

async function readQuestionTexts(row: QuestionLocation): Promise<string[]> {
	const texts: string[] = []
	for (const file of MARKDOWN_FILES) {
		const found = await findFirstMarkdown(
			questionMarkdownCandidates({
				storedPath: file.pointer(row),
				topicSlug: row.topicSlug,
				testSlug: row.testSlug,
				testId: row.testId,
				questionId: row.questionId,
				fileName: file.fileName,
			})
		)
		if (found) texts.push(found.text)
	}
	return texts
}

export async function inventoryAssetRefs(): Promise<AssetInventory> {
	const rows = await selectLocations(false)
	const module = storage()
	const existence = new Map<string, boolean>()
	const exists = async (key: string) => {
		let known = existence.get(key)
		if (known === undefined) {
			known = await module.exists(key)
			existence.set(key, known)
		}
		return known
	}

	const inventory: AssetInventory = {
		questions: rows.length,
		links: [],
		byForm: Object.fromEntries(ASSET_LINK_FORMS.map((form) => [form, 0])) as Record<AssetLinkForm, number>,
		byNamespace: {},
		outsideNamespaces: [],
		nonServable: [],
		invalid: [],
		missingObjects: [],
		missingPointers: [],
	}

	for (const row of rows) {
		for (const file of MARKDOWN_FILES) {
			const pointer = file.pointer(row)
			if (pointer && !(await exists(pointer))) {
				inventory.missingPointers.push({ questionId: row.questionId, kind: file.kind, key: pointer })
			}
		}

		const seen = new Set<string>()
		for (const text of await readQuestionTexts(row)) {
			for (const link of extractAssetLinks(text)) {
				inventory.links.push({ ...link, questionId: row.questionId })
				inventory.byForm[link.form] += 1
				if (link.key === null) {
					if (link.form === 'invalid') inventory.invalid.push({ questionId: row.questionId, src: link.src })
					continue
				}
				const namespace = link.key.slice(0, link.key.indexOf('/'))
				inventory.byNamespace[namespace] = (inventory.byNamespace[namespace] ?? 0) + 1
				if (seen.has(link.key)) continue
				seen.add(link.key)
				const ref = { questionId: row.questionId, key: link.key, src: link.src }
				if (!isInsideNamespaces(link.key)) inventory.outsideNamespaces.push(ref)
				if (!isServableImageKey(link.key)) inventory.nonServable.push(ref)
				if (!(await exists(link.key))) inventory.missingObjects.push(ref)
			}
		}
	}

	return inventory
}

export async function backfillAssetRefs(): Promise<AssetBackfillResult> {
	const result: AssetBackfillResult = { processed: 0, indexed: 0, skipped: 0, failed: 0 }
	const rows = await selectLocations(true)
	for (const row of rows) {
		result.processed += 1
		try {
			const keys = collectKeys(await readQuestionTexts(row))
			const done = await db.transaction(async (tx) => {
				const locked = await tx.execute<MarkerRow>(
					sql`SELECT assets_indexed FROM questions WHERE id = ${row.questionId} FOR UPDATE`
				)
				const marker = locked.rows[0]
				if (!marker || marker.assets_indexed) return false
				await insertRefs(tx, row.questionId, keys)
				await tx.execute(sql`UPDATE questions SET assets_indexed = true WHERE id = ${row.questionId}`)
				return true
			})
			if (done) result.indexed += 1
			else result.skipped += 1
		} catch (error) {
			result.failed += 1
			console.error(`[asset-refs] failed question=${row.questionId}`, error)
		}
	}
	return result
}
