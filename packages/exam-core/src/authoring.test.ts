import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	AUTHORING_MESSAGES,
	exactChoiceCountMessage,
	keyShapeFor,
	maxOptionsMessage,
	minOptionsMessage,
	toCanonicalKey,
	validateQuestionForSave,
} from './authoring'
import {
	AUTHORING_CASE_GROUPS,
	KEY_SHAPE_CASES,
	ORDER_AUTHORING_CASES,
	SERVER_AUTHORING_RULES,
	TO_CANONICAL_KEY_CASES,
	type AuthoringCase,
} from './cases/authoring.cases'
import { QUESTION_UI_TEMPLATES } from './registry'

function validate(row: AuthoringCase): string | null {
	return validateQuestionForSave({ config: row.config, promptText: row.promptText, content: row.content, key: row.key })
}

for (const group of AUTHORING_CASE_GROUPS) {
	describe(`проверка при сохранении: ${group.template}`, () => {
		test.each(group.cases)('$name', (row) => {
			assert.equal(validate(row), row.expected)
		})
	})
}

describe('проверка при сохранении: порядок правил', () => {
	test.each(ORDER_AUTHORING_CASES)('$name', (row) => {
		assert.equal(validate(row), row.expected)
	})
})

describe('покрытие таблиц', () => {
	test('у каждого шаблона есть строки, которые проходят и отклоняются', () => {
		for (const template of QUESTION_UI_TEMPLATES) {
			const group = AUTHORING_CASE_GROUPS.find((item) => item.template === template)
			assert.ok(group, template)
			assert.ok(
				group.cases.some((row) => row.expected === null),
				`${template}: нет строки, которая проходит`
			)
			assert.ok(
				group.cases.some((row) => row.expected !== null),
				`${template}: нет отклоняющей строки`
			)
		}
	})

	test('каждое серверное правило имеет отклоняющую строку', () => {
		const rows = [...AUTHORING_CASE_GROUPS.flatMap((group) => group.cases), ...ORDER_AUTHORING_CASES]
		for (const rule of SERVER_AUTHORING_RULES) {
			const covering = rows.filter((row) => row.expected !== null && row.serverRules?.includes(rule))
			assert.ok(covering.length > 0, `нет отклоняющей строки для правила «${rule}»`)
		}
		for (const row of rows) {
			if (row.serverRules?.length)
				assert.notEqual(row.expected, null, `строка «${row.name}» помечена правилом, но проходит`)
		}
	})
})

describe('тексты ошибок', () => {
	test('тексты совпадают с таблицей «Тексты» UI-SPEC', () => {
		assert.deepEqual(
			{
				typeNotConfigured: AUTHORING_MESSAGES.typeNotConfigured,
				promptEmpty: AUTHORING_MESSAGES.promptEmpty,
				choiceOptionEmpty: AUTHORING_MESSAGES.choiceOptionEmpty,
				singleKeyMissing: AUTHORING_MESSAGES.singleKeyMissing,
				multiKeyMissing: AUTHORING_MESSAGES.multiKeyMissing,
				matchingTooFew: AUTHORING_MESSAGES.matchingTooFew,
				matchingItemEmpty: AUTHORING_MESSAGES.matchingItemEmpty,
				matchingKeyMissing: AUTHORING_MESSAGES.matchingKeyMissing,
				shortTextKeyMissing: AUTHORING_MESSAGES.shortTextKeyMissing,
				shortTextVariantsTooFew: AUTHORING_MESSAGES.shortTextVariantsTooFew,
				shortTextVariantEmpty: AUTHORING_MESSAGES.shortTextVariantEmpty,
				shortTextVariantsDuplicate: AUTHORING_MESSAGES.shortTextVariantsDuplicate,
				sequenceDigitsOnly: AUTHORING_MESSAGES.sequenceDigitsOnly,
			},
			{
				typeNotConfigured: 'Тип вопроса не настроен в БД',
				promptEmpty: 'Введите текст вопроса',
				choiceOptionEmpty: 'Заполните все варианты ответа',
				singleKeyMissing: 'Выберите правильный ответ',
				multiKeyMissing: 'Выберите правильные ответы',
				matchingTooFew: 'Добавьте минимум 2 пары для сопоставления',
				matchingItemEmpty: 'Заполните все элементы сопоставления',
				matchingKeyMissing: 'Укажите правильные соответствия',
				shortTextKeyMissing: 'Укажите правильный краткий ответ',
				shortTextVariantsTooFew: 'Укажите минимум два допустимых ответа',
				shortTextVariantEmpty: 'Заполните все допустимые ответы',
				shortTextVariantsDuplicate: 'Допустимые ответы не должны повторяться',
				sequenceDigitsOnly: 'Для последовательности используйте только цифры без пробелов',
			}
		)
	})

	test('тексты вне UI-SPEC', () => {
		assert.equal(AUTHORING_MESSAGES.choiceIdsInvalid, 'Варианты ответа должны иметь уникальные id')
		assert.equal(AUTHORING_MESSAGES.multiKeyUnknown, 'Выберите правильные ответы из списка вариантов')
		assert.equal(AUTHORING_MESSAGES.matchingIdsInvalid, 'Элементы сопоставления должны иметь уникальные id')
	})

	test('тексты с числом', () => {
		assert.equal(minOptionsMessage(1), 'Добавьте минимум 1 вариант ответа')
		assert.equal(minOptionsMessage(2), 'Добавьте минимум 2 варианта ответа')
		assert.equal(minOptionsMessage(5), 'Добавьте минимум 5 вариантов ответа')
		assert.equal(minOptionsMessage(21), 'Добавьте минимум 21 вариант ответа')
		assert.equal(maxOptionsMessage(1), 'Не более 1 варианта ответа')
		assert.equal(maxOptionsMessage(2), 'Не более 2 вариантов ответа')
		assert.equal(maxOptionsMessage(5), 'Не более 5 вариантов ответа')
		assert.equal(maxOptionsMessage(21), 'Не более 21 варианта ответа')
		assert.equal(exactChoiceCountMessage(1), 'Отметьте ровно 1 правильный ответ')
		assert.equal(exactChoiceCountMessage(2), 'Отметьте ровно 2 правильных ответа')
		assert.equal(exactChoiceCountMessage(5), 'Отметьте ровно 5 правильных ответов')
		assert.equal(exactChoiceCountMessage(12), 'Отметьте ровно 12 правильных ответов')
	})

	test('в текстах нет слов correct, left, right', () => {
		const texts = [
			...Object.values(AUTHORING_MESSAGES),
			...[0, 1, 2, 5, 11, 21].flatMap((n) => [minOptionsMessage(n), maxOptionsMessage(n), exactChoiceCountMessage(n)]),
		]
		for (const text of texts) {
			assert.doesNotMatch(text, /\b(correct|left|right)\b/i, text)
		}
	})
})

describe('форма ключа', () => {
	test.each(KEY_SHAPE_CASES)('$config.uiTemplate + $config.mistakeMetric → $expected', ({ config, expected }) => {
		assert.equal(keyShapeFor(config), expected)
	})
})

describe('каноничный ключ', () => {
	test.each(TO_CANONICAL_KEY_CASES)('$name', ({ uiTemplate, key, expected }) => {
		assert.deepEqual(toCanonicalKey({ uiTemplate, key }), expected)
	})
})
