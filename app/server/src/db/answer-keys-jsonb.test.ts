import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'
import * as schema from './schema.js'

const STRING_KEYS = ['3142', '1.50', 'true', 'митоз']

const KEYS: Array<{ name: string; value: unknown; kind: string }> = [
	...STRING_KEYS.map((key) => ({ name: key, value: key, kind: 'string' })),
	{ name: 'массив', value: ['эксперимент', 'моделирование'], kind: 'array' },
	{ name: 'объект', value: { l1: 'r1' }, kind: 'object' },
]

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null
let db: NodePgDatabase<typeof schema>
const questionIds = new Map<string, string>()

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_answer_keys')
	await migrateTestDatabase(scratch.url)
	pool = new Pool({ connectionString: scratch.url })
	db = drizzle(pool, { schema })

	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: 'answer-keys', title: 'Ключи ответов' })
		.returning({ id: schema.topics.id })
	assert.ok(topic)
	const [created] = await db
		.insert(schema.tests)
		.values({ topicId: topic.id, slug: 'answer-keys', title: 'Ключи ответов' })
		.returning({ id: schema.tests.id })
	assert.ok(created)

	for (const [index, key] of KEYS.entries()) {
		const [question] = await db
			.insert(schema.questions)
			.values({ testId: created.id, type: 'short_answer', order: index })
			.returning({ id: schema.questions.id })
		assert.ok(question)
		await db.insert(schema.answerKeys).values({ questionId: question.id, correctAnswer: key.value })
		questionIds.set(key.name, question.id)
	}
}, 60_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
})

function questionIdOf(name: string): string {
	const id = questionIds.get(name)
	assert.ok(id, `no question for key ${name}`)
	return id
}

describe('запись answer_keys.correct_answer через Drizzle', () => {
	for (const key of KEYS) {
		test(`jsonb_typeof ключа ${key.name} — ${key.kind}`, async () => {
			assert.ok(pool)
			const { rows } = await pool.query<{ question_id: string; kind: string }>(
				'SELECT question_id, jsonb_typeof(correct_answer) AS kind FROM answer_keys WHERE question_id = $1',
				[questionIdOf(key.name)]
			)
			assert.equal(rows.length, 1)
			assert.equal(rows[0]?.kind, key.kind)
		})
	}
})

const READERS: Array<{ name: string; read: () => Promise<Array<{ questionId: string; correctAnswer: unknown }>> }> = [
	{ name: 'db.select().from(schema.answerKeys)', read: () => db.select().from(schema.answerKeys) },
	{ name: 'db.query.answerKeys.findMany()', read: () => db.query.answerKeys.findMany() },
]

for (const reader of READERS) {
	describe(`чтение через ${reader.name}`, () => {
		async function readKey(name: string): Promise<unknown> {
			const rows = await reader.read()
			const row = rows.find((item) => item.questionId === questionIdOf(name))
			assert.ok(row, `no answer key row for ${name}`)
			return row.correctAnswer
		}

		test('чтение вернуло все вставленные строки', async () => {
			const rows = await reader.read()
			assert.equal(rows.length, KEYS.length)
			assert.deepEqual(new Set(rows.map((row) => row.questionId)), new Set(questionIds.values()))
		})

		for (const key of STRING_KEYS) {
			test(`чтение ключа ${key} через Drizzle возвращает строку`, async () => {
				const value = await readKey(key)
				assert.equal(typeof value, 'string')
				assert.equal(value, key)
			})
		}

		test('массив читается без изменений', async () => {
			assert.deepEqual(await readKey('массив'), ['эксперимент', 'моделирование'])
		})

		test('объект читается без изменений', async () => {
			assert.deepEqual(await readKey('объект'), { l1: 'r1' })
		})
	})
}
