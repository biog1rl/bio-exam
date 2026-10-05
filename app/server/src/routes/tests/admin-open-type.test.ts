import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	ATTEMPT_QUESTIONS,
	createAttemptTest,
	seedAttemptWorld,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

let ctx: AuthApp
let world: AttemptWorld

const OPEN_RULE = { formula: 'exact_match', mistakeMetric: 'manual', correctPoints: 3 }
const CUSTOM_KEY = 'custom_short'

beforeAll(async () => {
	ctx = await startAuthApp('test_admin_open_type')
	world = await seedAttemptWorld(ctx, 'opentype')
	const created = await call(ctx, 'POST', '/api/tests/question-types', {
		cookies: world.adminCookie,
		body: {
			key: CUSTOM_KEY,
			title: 'Краткий ответ',
			uiTemplate: 'short_text',
			scoringRule: { formula: 'exact_match', mistakeMetric: 'compact_text_equal', correctPoints: 1 },
		},
	})
	assert.equal(created.status, 201, JSON.stringify(created.body))
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function patchType(key: string, body: unknown) {
	return call(ctx, 'PATCH', `/api/tests/question-types/${key}`, { cookies: world.adminCookie, body })
}

async function openRow() {
	const result = await ctx.pgPool.query<{ is_active: boolean; scoring_rule: unknown }>(
		`SELECT is_active, scoring_rule FROM question_types WHERE key = 'open'`
	)
	const row = result.rows[0]
	assert.ok(row, 'open type row not found')
	return row
}

describe('тип open в админских настройках', () => {
	test('тип открыт для чтения и выключен', async () => {
		const reply = await call(ctx, 'GET', '/api/tests/question-types/open', { cookies: world.adminCookie })
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		const type = reply.body.questionType as Record<string, unknown>
		assert.equal(type.uiTemplate, 'open')
		assert.equal(type.isActive, false)
	})

	test('включение открытого типа прямым PATCH отклонено и тип остаётся выключенным', async () => {
		const reply = await patchType('open', { isActive: true })
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.equal(reply.body.error, 'Открытые вопросы пока недоступны')
		assert.equal((await openRow()).is_active, false)
	})

	test('сохранение с неизменёнными значениями проходит', async () => {
		const reply = await patchType('open', {
			title: 'Открытый вопрос',
			description: 'Развёрнутый ответ, баллы от 0 до 3 выставляет учитель',
			uiTemplate: 'open',
			scoringRule: OPEN_RULE,
			isActive: false,
		})
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
	})

	test.each([
		['другой максимум', { ...OPEN_RULE, correctPoints: 5 }],
		['другая метрика', { ...OPEN_RULE, mistakeMetric: 'boolean_correct' }],
		['другая формула', { ...OPEN_RULE, formula: 'one_mistake_partial', oneMistakePoints: 1 }],
	])('правка правила открытого типа отклонена: %s', async (_title, scoringRule) => {
		const reply = await patchType('open', { scoringRule })
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.equal(reply.body.error, 'Баллы за открытый вопрос выставляет учитель: от 0 до 3')
		assert.deepEqual((await openRow()).scoring_rule, OPEN_RULE)
	})

	test('создание кастомного типа с шаблоном open отклонено', async () => {
		const reply = await call(ctx, 'POST', '/api/tests/question-types', {
			cookies: world.adminCookie,
			body: {
				key: 'custom_open',
				title: 'Свой открытый',
				uiTemplate: 'open',
				scoringRule: OPEN_RULE,
			},
		})
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.equal(reply.body.error, 'Открытый тип вопроса создаётся системой')
		const rows = await ctx.pgPool.query(`SELECT 1 FROM question_types WHERE key = 'custom_open'`)
		assert.equal(rows.rowCount, 0)
	})

	test('смена шаблона кастомного типа на open отклонена', async () => {
		const reply = await patchType(CUSTOM_KEY, { uiTemplate: 'open' })
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.equal(reply.body.error, 'Открытый тип вопроса создаётся системой')
		const rows = await ctx.pgPool.query<{ ui_template: string }>(
			`SELECT ui_template FROM question_types WHERE key = $1`,
			[CUSTOM_KEY]
		)
		assert.equal(rows.rows[0]?.ui_template, 'short_text')
	})

	test('метрика manual для кастомного типа short_text отклонена в правиле теста', async () => {
		const testId = await createAttemptTest(world, { slug: 'opentype-manual' })
		const reply = await call(ctx, 'PUT', `/api/tests/question-types/tests/${testId}/overrides/${CUSTOM_KEY}`, {
			cookies: world.adminCookie,
			body: { scoringRuleOverride: { ...OPEN_RULE, mistakeMetric: 'manual' } },
		})
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
	})

	test('правило для open в тесте отклонено, название и отключение проходят', async () => {
		const testId = await createAttemptTest(world, { slug: 'opentype-override' })
		const path = `/api/tests/question-types/tests/${testId}/overrides/open`
		const withRule = await call(ctx, 'PUT', path, {
			cookies: world.adminCookie,
			body: { scoringRuleOverride: { ...OPEN_RULE, correctPoints: 5 } },
		})
		assert.equal(withRule.status, 400, JSON.stringify(withRule.body))
		const withSameRule = await call(ctx, 'PUT', path, {
			cookies: world.adminCookie,
			body: { scoringRuleOverride: OPEN_RULE },
		})
		assert.equal(withSameRule.status, 400, JSON.stringify(withSameRule.body))
		const withoutRule = await call(ctx, 'PUT', path, {
			cookies: world.adminCookie,
			body: { titleOverride: 'Развёрнутый ответ', isDisabled: true },
		})
		assert.equal(withoutRule.status, 200, JSON.stringify(withoutRule.body))
	})

	test('вопрос типа open не создаётся, пока тип выключен', async () => {
		const testId = await createAttemptTest(world, { slug: 'opentype-question' })
		const reply = await call(ctx, 'POST', `/api/tests/${testId}/questions`, {
			cookies: world.adminCookie,
			body: { ...ATTEMPT_QUESTIONS.short_answer, type: 'open' },
		})
		assert.equal(reply.status, 400, JSON.stringify(reply.body))
		assert.match(String(reply.body.error), /Тип вопроса отключён/)
	})
})
