import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError } from '../../lib/errors.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type LockedTest = { id: string; slug: string; topicId: string; version: number; isPublished: boolean }

type LockedTestRow = { id: string; slug: string; topic_id: string; version: number; is_published: boolean }

type OrderRow = { id: string; order: number }

export async function lockTest(tx: Tx, testId: string): Promise<LockedTest> {
	const result = await tx.execute<LockedTestRow>(sql`
		SELECT id, slug, topic_id, version, is_published FROM tests WHERE id = ${testId} FOR UPDATE
	`)
	const row = result.rows[0]
	if (!row) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	return {
		id: row.id,
		slug: row.slug,
		topicId: row.topic_id,
		version: Number(row.version),
		isPublished: row.is_published,
	}
}

export function insertAt(ids: string[], id: string, position: number): string[] {
	const rest = ids.filter((value) => value !== id)
	const index = Math.min(Math.max(position, 0), rest.length)
	return [...rest.slice(0, index), id, ...rest.slice(index)]
}

function sameIds(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false
	const expected = new Set(left)
	if (expected.size !== left.length) return false
	const seen = new Set<string>()
	for (const id of right) {
		if (!expected.has(id) || seen.has(id)) return false
		seen.add(id)
	}
	return true
}

export async function resequenceQuestions(
	tx: Tx,
	testId: string,
	arrange?: (ids: string[]) => string[]
): Promise<string[]> {
	const result = await tx.execute<OrderRow>(sql`
		SELECT id, "order" FROM questions WHERE test_id = ${testId} ORDER BY "order", created_at, id
	`)
	const current = result.rows.map((row) => row.id)
	const ordered = arrange ? arrange([...current]) : current
	if (!sameIds(current, ordered)) {
		throw new Error('resequenceQuestions: arrange must return the same question ids')
	}

	const previous = new Map(result.rows.map((row) => [row.id, Number(row.order)]))
	const changed = ordered.map((id, order) => ({ id, order })).filter((entry) => previous.get(entry.id) !== entry.order)

	if (changed.length > 0) {
		const values = sql.join(
			changed.map((entry) => sql`(${entry.id}::uuid, ${entry.order}::integer)`),
			sql`, `
		)
		await tx.execute(sql`
			UPDATE questions AS q
			SET "order" = v.ord, updated_at = now()
			FROM (VALUES ${values}) AS v(id, ord)
			WHERE q.id = v.id AND q.test_id = ${testId}
		`)
	}

	return ordered
}
