import assert from 'node:assert/strict'
import { test } from 'vitest'

import { MatchingPairsSchema, OptionSchema, QuestionIdValueSchema, QuestionKeyPayloadSchema } from './content'

const keyPayloadAccepted: Array<{ name: string; value: unknown; expected: unknown }> = [
	{ name: 'число приводится к строке', value: 3, expected: '3' },
	{ name: 'строка остаётся строкой', value: 'a', expected: 'a' },
	{ name: 'массив смешанных id', value: [1, '2'], expected: ['1', '2'] },
	{ name: 'пустой массив', value: [], expected: [] },
	{ name: 'объект с числовым значением', value: { a: 1 }, expected: { a: '1' } },
	{ name: 'объект со строковым значением', value: { a: 'b' }, expected: { a: 'b' } },
]

for (const row of keyPayloadAccepted) {
	test(`QuestionKeyPayloadSchema: ${row.name}`, () => {
		assert.deepEqual(QuestionKeyPayloadSchema.parse(row.value), row.expected)
	})
}

const keyPayloadRejected: Array<{ name: string; value: unknown }> = [
	{ name: 'null', value: null },
	{ name: 'true', value: true },
	{ name: 'массив с null', value: [null] },
	{ name: 'объект с null', value: { a: null } },
	{ name: 'undefined', value: undefined },
]

for (const row of keyPayloadRejected) {
	test(`QuestionKeyPayloadSchema: отклоняет — ${row.name}`, () => {
		assert.equal(QuestionKeyPayloadSchema.safeParse(row.value).success, false)
	})
}

test('QuestionIdValueSchema: число приводится к строке, строка остаётся', () => {
	assert.equal(QuestionIdValueSchema.parse(7), '7')
	assert.equal(QuestionIdValueSchema.parse('7'), '7')
	assert.equal(QuestionIdValueSchema.safeParse(null).success, false)
})

test('OptionSchema: числовой id приводится к строке', () => {
	assert.deepEqual(OptionSchema.parse({ id: 1, text: 'x' }), { id: '1', text: 'x' })
})

test('OptionSchema: строковый id остаётся, отсутствие text отклоняется', () => {
	assert.deepEqual(OptionSchema.parse({ id: 'a', text: 'x' }), { id: 'a', text: 'x' })
	assert.equal(OptionSchema.safeParse({ id: 'a' }).success, false)
	assert.equal(OptionSchema.safeParse({ text: 'x' }).success, false)
})

test('MatchingPairsSchema: числовые id обеих колонок приводятся к строке', () => {
	assert.deepEqual(
		MatchingPairsSchema.parse({
			left: [{ id: 1, text: 'l1' }],
			right: [
				{ id: 2, text: 'r1' },
				{ id: 'r2', text: 'r2' },
			],
		}),
		{
			left: [{ id: '1', text: 'l1' }],
			right: [
				{ id: '2', text: 'r1' },
				{ id: 'r2', text: 'r2' },
			],
		}
	)
})

test('MatchingPairsSchema: без right отклоняется', () => {
	assert.equal(MatchingPairsSchema.safeParse({ left: [] }).success, false)
})
