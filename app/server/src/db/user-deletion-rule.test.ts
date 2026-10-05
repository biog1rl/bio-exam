import { eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../test-support/attempt-world.js'
import { seedUser, startAuthApp, type AuthApp } from '../test-support/auth-app.js'
import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'

type ForeignKey = {
	table: string
	constraint: string
	column: string
	deleteRule: string
	notNull: boolean
}

type LegacyException = { table: string; column: string; reason: string }

const LEGACY_EXCEPTIONS: LegacyException[] = []

const ALLOWED_RULES = new Set(['c', 'n'])

const FOREIGN_KEYS_SQL = `
	SELECT c.conrelid::regclass::text AS "table",
		c.conname AS constraint,
		a.attname AS "column",
		c.confdeltype AS "deleteRule",
		a.attnotnull AS "notNull"
	FROM pg_constraint c
	CROSS JOIN LATERAL unnest(c.conkey) AS k(attnum)
	JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
	WHERE c.contype = 'f' AND c.confrelid = $1::regclass
	ORDER BY 1, 3
`

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null

function describeKey(key: ForeignKey): string {
	return `${key.table}.${key.column} (${key.constraint}): confdeltype ${key.deleteRule}`
}

function isLegacy(key: ForeignKey): boolean {
	return LEGACY_EXCEPTIONS.some((entry) => entry.table === key.table && entry.column === key.column)
}

async function foreignKeysTo(target: string): Promise<ForeignKey[]> {
	assert.ok(pool, 'pool is not initialised')
	const result = await pool.query<ForeignKey>(FOREIGN_KEYS_SQL, [target])
	return result.rows
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_user_deletion_rule')
	await migrateTestDatabase(scratch.url)
	pool = new Pool({ connectionString: scratch.url })
}, 60_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
})

describe('правило удаления пользователя: каталог внешних ключей на users', () => {
	test('каждый внешний ключ на users каскадный или обнуляющий, кроме названных исключений', async () => {
		const keys = await foreignKeysTo('users')
		assert.ok(keys.length > 0, 'catalog of foreign keys to users is empty')
		const violations = keys.filter((key) => !isLegacy(key) && !ALLOWED_RULES.has(key.deleteRule)).map(describeKey)
		assert.deepEqual([], violations)
	})

	test('столбец с ON DELETE SET NULL допускает NULL', async () => {
		const keys = await foreignKeysTo('users')
		const violations = keys.filter((key) => key.deleteRule === 'n' && key.notNull).map(describeKey)
		assert.deepEqual([], violations)
	})

	test('запись из LEGACY_EXCEPTIONS всё ещё нарушает правило, иначе её нужно убрать из списка', async () => {
		const keys = await foreignKeysTo('users')
		const stale = LEGACY_EXCEPTIONS.filter((entry) => {
			const found = keys.find((key) => key.table === entry.table && key.column === entry.column)
			return found === undefined || ALLOWED_RULES.has(found.deleteRule)
		}).map((entry) => `${entry.table}.${entry.column}: убрать из LEGACY_EXCEPTIONS (${entry.reason})`)
		assert.deepEqual([], stale)
	})

	test.each(['test_attempts', 'test_sessions'])(
		'внешние ключи на %s каскадные или обнуляющие: каскад от пользователя не блокируется',
		async (target) => {
			const keys = await foreignKeysTo(target)
			const violations = keys.filter((key) => !ALLOWED_RULES.has(key.deleteRule)).map(describeKey)
			assert.deepEqual([], violations)
		}
	)
})

describe('правило удаления пользователя: поведение на живой схеме', () => {
	let ctx: AuthApp | null = null
	let world: AttemptWorld | null = null

	beforeAll(async () => {
		ctx = await startAuthApp('test_user_deletion')
		world = await seedAttemptWorld(ctx, 'deletion')
	}, 60_000)

	afterAll(async () => {
		await ctx?.stop()
	})

	async function count(text: string, params: unknown[]): Promise<number> {
		assert.ok(ctx, 'app is not initialised')
		const result = await ctx.pgPool.query<{ count: number }>(text, params)
		return Number(result.rows[0]?.count ?? 0)
	}

	test('удаление ученика удаляет его попытки, сессии, назначения, членство в группе и роли', async () => {
		assert.ok(ctx && world)
		const { db, schema } = ctx
		const student = await seedStudent(world, 'deletion_student')
		const testId = await createAttemptTest(world, { slug: 'deletion-student-test' })
		const questionId = await addQuestion(world, testId, 'radio')
		await assignTest(world, testId, student.id)
		const [group] = await db
			.insert(schema.studentGroups)
			.values({ name: 'Группа удаления', createdBy: world.adminId })
			.returning({ id: schema.studentGroups.id })
		assert.ok(group)
		await db.insert(schema.userGroups).values({ groupId: group.id, userId: student.id })
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const submitted = await submitAttempt(world, student.cookie, testId, {
			sessionId: started.body.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(submitted.status, 200)
		for (const table of ['test_attempts', 'test_sessions', 'test_assignments', 'user_groups', 'user_roles']) {
			assert.equal(
				await count(`SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`, [student.id]),
				1,
				table
			)
		}

		await ctx.pgPool.query('DELETE FROM users WHERE id = $1', [student.id])

		for (const table of ['test_attempts', 'test_sessions', 'test_assignments', 'user_groups', 'user_roles']) {
			assert.equal(
				await count(`SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`, [student.id]),
				0,
				table
			)
		}
		assert.equal(await count('SELECT count(*)::int AS count FROM tests WHERE id = $1', [testId]), 1)
	})

	test('удаление автора обнуляет ссылки на него, а тест и назначение остаются', async () => {
		assert.ok(ctx && world)
		const { db, schema } = ctx
		const author = await seedUser(ctx, { login: 'deletion_author', roles: ['admin'], password: world.password })
		const assignee = await seedStudent(world, 'deletion_assignee')
		const testId = await createAttemptTest(world, { slug: 'deletion-author-test' })
		await db.update(schema.tests).set({ createdBy: author }).where(eq(schema.tests.id, testId))
		await db.insert(schema.testAssignments).values({ testId, userId: assignee.id, assignedBy: author })

		await ctx.pgPool.query('DELETE FROM users WHERE id = $1', [author])

		const testRow = await ctx.pgPool.query<{ created_by: string | null }>(
			'SELECT created_by FROM tests WHERE id = $1',
			[testId]
		)
		assert.equal(testRow.rowCount, 1)
		assert.equal(testRow.rows[0]?.created_by, null)
		const assignment = await ctx.pgPool.query<{ assigned_by: string | null }>(
			'SELECT assigned_by FROM test_assignments WHERE test_id = $1 AND user_id = $2',
			[testId, assignee.id]
		)
		assert.equal(assignment.rowCount, 1)
		assert.equal(assignment.rows[0]?.assigned_by, null)
	})

	test('удаление пользователя, пригласившего другого, обнуляет created_by приглашённого', async () => {
		assert.ok(ctx && world)
		const inviter = await seedUser(ctx, { login: 'deletion_inviter', roles: ['teacher'], password: world.password })
		const invited = await seedStudent(world, 'deletion_invited')
		await ctx.pgPool.query('UPDATE users SET created_by = $1 WHERE id = $2', [inviter, invited.id])

		await ctx.pgPool.query('DELETE FROM users WHERE id = $1', [inviter])

		const invitedRow = await ctx.pgPool.query<{ created_by: string | null }>(
			'SELECT created_by FROM users WHERE id = $1',
			[invited.id]
		)
		assert.equal(invitedRow.rowCount, 1)
		assert.equal(invitedRow.rows[0]?.created_by, null)
	})
})
