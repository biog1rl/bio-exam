import assert from 'node:assert/strict'
import { test } from 'vitest'

import { TEMPLATE_ADAPTERS } from './adapters/index'
import { AnswerValueSchema } from './attempt-result'
import { ANSWER_SHAPE_CASES } from './cases/answer.cases'
import { QUESTION_UI_TEMPLATES } from './registry'

test.each(ANSWER_SHAPE_CASES)('$name', (row) => {
	const adapter = TEMPLATE_ADAPTERS[row.template]
	assert.equal(adapter.answerSchema.safeParse(row.value).success, row.accepted)
	assert.deepEqual(adapter.normalizeAnswer(row.value), row.normalized)
})

test('конверт submit не уже формы ответа шаблона: принятое адаптером принимает AnswerValueSchema', () => {
	const accepted = ANSWER_SHAPE_CASES.filter((row) => row.accepted)
	assert.ok(accepted.length >= QUESTION_UI_TEMPLATES.length)
	for (const row of accepted) {
		assert.equal(AnswerValueSchema.safeParse(row.value).success, true, row.name)
	}
})

test('таблица формы ответа покрывает все шаблоны, не меньше трёх строк на шаблон', () => {
	for (const template of QUESTION_UI_TEMPLATES) {
		const rows = ANSWER_SHAPE_CASES.filter((row) => row.template === template)
		assert.ok(rows.length >= 3, `${template}: строк ${rows.length}`)
		assert.ok(
			rows.some((row) => row.accepted),
			`${template}: нет принимаемой формы`
		)
		assert.ok(
			rows.some((row) => !row.accepted),
			`${template}: нет отклоняемой формы`
		)
	}
})
