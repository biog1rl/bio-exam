import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { DEFAULT_CHART_CONFIGS } from '../lib/charts/config.js'
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../test-support/auth-app.js'

const PASSWORD = 'chart-settings-password-1'

let ctx: AuthApp
let adminJar: CookieJar
let studentJar: CookieJar

type ChartsReply = { configs: typeof DEFAULT_CHART_CONFIGS; updatedAt: string | null }

beforeAll(async () => {
	ctx = await startAuthApp('test_chart_settings')
	await seedUser(ctx, { login: 'charts_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'charts_student', roles: ['user'], password: PASSWORD })
	adminJar = (await login(ctx, 'charts_admin', PASSWORD)).jar
	studentJar = (await login(ctx, 'charts_student', PASSWORD)).jar
}, 120_000)

afterAll(async () => {
	await ctx?.stop()
})

async function readCharts(jar: CookieJar): Promise<ChartsReply> {
	const reply = await call(ctx, 'GET', '/api/settings/charts', { cookies: jar })
	assert.equal(reply.status, 200)
	return reply.body as unknown as ChartsReply
}

describe('настройки графиков', { shuffle: false }, () => {
	test('после миграций ученик получает настройки по умолчанию', async () => {
		const charts = await readCharts(studentJar)
		assert.deepEqual(charts.configs, DEFAULT_CHART_CONFIGS)
	})

	test('PUT одного графика сохраняет его и не трогает остальные', async () => {
		const testResults = {
			type: 'line',
			x: 'week',
			y: 'average',
			color: 'none',
			period: '3months',
			legend: true,
			labels: 'value',
		} as const
		const reply = await call(ctx, 'PUT', '/api/settings/charts', {
			cookies: adminJar,
			body: { configs: { testResults } },
		})
		assert.equal(reply.status, 200)
		const charts = await readCharts(studentJar)
		assert.deepEqual(charts.configs, { ...DEFAULT_CHART_CONFIGS, testResults })
		assert.ok(charts.updatedAt)
	})

	test('следующий PUT другого графика сохраняет предыдущий', async () => {
		const activity = { type: 'line', metric: 'both', period: 'week', legend: true, labels: 'none' } as const
		const reply = await call(ctx, 'PUT', '/api/settings/charts', { cookies: adminJar, body: { configs: { activity } } })
		assert.equal(reply.status, 200)
		const charts = await readCharts(adminJar)
		assert.equal(charts.configs.testResults.type, 'line')
		assert.deepEqual(charts.configs.activity, activity)
		const stored = await ctx.pgPool.query<{ keys: string[] }>(
			`SELECT array(SELECT jsonb_object_keys(configs) ORDER BY 1) AS keys FROM chart_settings WHERE id = 'global'`
		)
		assert.deepEqual(stored.rows[0]?.keys, ['activity', 'testResults'])
	})

	for (const [name, configs] of [
		['неизвестный график', { pie: {} }],
		['значение вне списка', { activity: { ...DEFAULT_CHART_CONFIGS.activity, type: 'pie' } }],
		['лишнее поле', { activity: { ...DEFAULT_CHART_CONFIGS.activity, color: 'red' } }],
		['неполная настройка', { testResults: { type: 'bar' } }],
		['пустой список рядов', { content: { ...DEFAULT_CHART_CONFIGS.content, series: [] } }],
		['повтор ряда', { content: { ...DEFAULT_CHART_CONFIGS.content, series: ['drafts', 'drafts'] } }],
	] as const) {
		test(`PUT отклоняет: ${name}`, async () => {
			const reply = await call(ctx, 'PUT', '/api/settings/charts', { cookies: adminJar, body: { configs } })
			assert.equal(reply.status, 400)
		})
	}

	test('испорченное поле в базе заменяется значением по умолчанию, остальные поля сохраняются', async () => {
		await ctx.pgPool.query(
			`UPDATE chart_settings SET configs = jsonb_set(configs, '{testResults,type}', '"pie"') WHERE id = 'global'`
		)
		const charts = await readCharts(studentJar)
		assert.equal(charts.configs.testResults.type, DEFAULT_CHART_CONFIGS.testResults.type)
		assert.equal(charts.configs.testResults.period, '3months')
	})
})
