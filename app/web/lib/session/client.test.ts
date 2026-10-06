import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, test, vi } from 'vitest'

import { parseAuthMe } from '@/lib/auth/authMePayload'

import { AuthExpiredError, createSessionClient } from './client'
import type { SessionTransport } from './transport'

type Reply = Response | Error | (() => Promise<Response>)

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

function status(code: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), { status: code })
}

const meBody = {
	ok: true,
	accessExpiresAt: '2026-10-04T10:00:00.000Z',
	user: { id: 'user-1', login: 'student', roles: ['user'], perms: ['tests.read', 'tests.solve'] },
}

function queue(replies: Reply[], fallback: () => Response) {
	return async (): Promise<Response> => {
		const next = replies.shift()
		if (next === undefined) return fallback()
		if (next instanceof Error) throw next
		if (typeof next === 'function') return next()
		return next
	}
}

function scenario(options: { path?: string; me?: Reply[]; refresh?: Reply[]; request?: Reply[]; logout?: Reply[] }) {
	const calls = { me: 0, refresh: 0, logout: 0, request: [] as string[] }
	const me = queue(options.me ?? [], () => status(200, meBody))
	const refresh = queue(options.refresh ?? [], () => status(200, { ok: true, accessExpiresAt: null }))
	const request = queue(options.request ?? [], () => status(200, { ok: true }))
	const logout = queue(options.logout ?? [], () => status(200, { ok: true }))
	const transport: SessionTransport = {
		me: () => {
			calls.me += 1
			return me()
		},
		refresh: () => {
			calls.refresh += 1
			return refresh()
		},
		logout: () => {
			calls.logout += 1
			return logout()
		},
		request: (url) => {
			calls.request.push(url)
			return request()
		},
	}
	const navigate = vi.fn<(url: string) => void>()
	const client = createSessionClient({ transport, navigate, currentPath: () => options.path ?? '/admin/tests?q=1' })
	return { client, calls, navigate }
}

async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
	try {
		return { value: await promise }
	} catch (error) {
		return { error }
	}
}

describe('fetchWithSession', () => {
	test('три одновременных 401 дают один refresh и по одному повтору', async () => {
		const gate = deferred<Response>()
		const { client, calls, navigate } = scenario({
			request: [
				status(401),
				status(401),
				status(401),
				status(200, { n: 1 }),
				status(200, { n: 2 }),
				status(200, { n: 3 }),
			],
			refresh: [() => gate.promise],
		})
		const pending = [client.fetchWithSession('/a'), client.fetchWithSession('/b'), client.fetchWithSession('/c')]
		await vi.waitFor(() => assert.equal(calls.request.length, 3))
		await new Promise((r) => setTimeout(r, 0))
		assert.equal(calls.refresh, 1)
		gate.resolve(status(200, { ok: true, accessExpiresAt: null }))
		const responses = await Promise.all(pending)
		assert.equal(calls.refresh, 1)
		assert.deepEqual(calls.request, ['/a', '/b', '/c', '/a', '/b', '/c'])
		assert.deepEqual(
			responses.map((r) => r.status),
			[200, 200, 200]
		)
		assert.equal(navigate.mock.calls.length, 0)
	})

	test('refresh 401: каждый вызов бросает AuthExpiredError, навигация на логин одна', async () => {
		const gate = deferred<Response>()
		const { client, calls, navigate } = scenario({
			request: [status(401), status(401), status(401)],
			refresh: [() => gate.promise],
		})
		const pending = [client.fetchWithSession('/a'), client.fetchWithSession('/b'), client.fetchWithSession('/c')].map(
			settle
		)
		await vi.waitFor(() => assert.equal(calls.request.length, 3))
		gate.resolve(status(401))
		const results = await Promise.all(pending)
		for (const result of results) {
			assert.ok(result.error instanceof AuthExpiredError)
			assert.equal(result.error.message, 'Сессия истекла. Пожалуйста, войдите снова.')
			assert.equal(result.error.name, 'AuthExpiredError')
		}
		assert.equal(calls.refresh, 1)
		assert.deepEqual(navigate.mock.calls, [['/login?callbackUrl=%2Fadmin%2Ftests%3Fq%3D1']])
	})

	test('refresh 500: unavailable, навигации нет, вызовы получают исходный 401', async () => {
		const gate = deferred<Response>()
		const { client, calls, navigate } = scenario({
			request: [status(401), status(401), status(401), status(401)],
			refresh: [() => gate.promise, status(200, { ok: true, accessExpiresAt: null })],
		})
		const pending = [client.fetchWithSession('/a'), client.fetchWithSession('/b'), client.fetchWithSession('/c')]
		await vi.waitFor(() => assert.equal(calls.request.length, 3))
		gate.resolve(status(500))
		const responses = await Promise.all(pending)
		assert.deepEqual(
			responses.map((r) => r.status),
			[401, 401, 401]
		)
		assert.equal(calls.refresh, 1)
		assert.equal(navigate.mock.calls.length, 0)
		const next = await client.fetchWithSession('/d')
		assert.equal(calls.refresh, 2)
		assert.equal(next.status, 200)
	})

	test('сбой сети при refresh: unavailable, навигации нет, возвращается исходный 401', async () => {
		const { client, calls, navigate } = scenario({
			request: [status(401)],
			refresh: [new TypeError('Failed to fetch')],
		})
		const response = await client.fetchWithSession('/a')
		assert.equal(response.status, 401)
		assert.equal(calls.refresh, 1)
		assert.equal(navigate.mock.calls.length, 0)
	})

	test('повтор после успешного refresh снова 401: AuthExpiredError и одна навигация', async () => {
		const { client, calls, navigate } = scenario({
			request: [status(401), status(401)],
		})
		const result = await settle(client.fetchWithSession('/a'))
		assert.ok(result.error instanceof AuthExpiredError)
		assert.equal(calls.refresh, 1)
		assert.equal(calls.request.length, 2)
		assert.deepEqual(navigate.mock.calls, [['/login?callbackUrl=%2Fadmin%2Ftests%3Fq%3D1']])
	})

	for (const code of [403, 500]) {
		test(`ответ ${code} на запрос возвращается как есть без refresh`, async () => {
			const { client, calls, navigate } = scenario({ request: [status(code)] })
			const response = await client.fetchWithSession('/a')
			assert.equal(response.status, code)
			assert.equal(calls.refresh, 0)
			assert.equal(navigate.mock.calls.length, 0)
		})
	}

	for (const path of ['/login', '/login?callbackUrl=%2Fdashboard', '/invite/abc']) {
		test(`на ${path} навигации нет, AuthExpiredError бросается`, async () => {
			const { client, navigate } = scenario({ path, request: [status(401)], refresh: [status(401)] })
			const result = await settle(client.fetchWithSession('/a'))
			assert.ok(result.error instanceof AuthExpiredError)
			assert.equal(navigate.mock.calls.length, 0)
		})
	}

	test('после завершения refresh следующий 401 запускает новый refresh', async () => {
		const { client, calls } = scenario({ request: [status(401), status(200), status(401), status(200)] })
		assert.equal((await client.fetchWithSession('/a')).status, 200)
		assert.equal(calls.refresh, 1)
		assert.equal((await client.fetchWithSession('/b')).status, 200)
		assert.equal(calls.refresh, 2)
	})
})

describe('refreshOnce', () => {
	test.each(
		[
			{
				name: '200 → ok с accessExpiresAt из тела',
				body: { ok: true, accessExpiresAt: '2026-10-04T10:00:00.000Z' },
				accessExpiresAt: '2026-10-04T10:00:00.000Z',
			},
			{ name: '200 без срока → ok с null', body: { ok: true }, accessExpiresAt: null },
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { body, accessExpiresAt }) => {
		const { client } = scenario({ refresh: [status(200, body)] })
		assert.deepEqual(await client.refreshOnce(), { kind: 'ok', accessExpiresAt })
	})

	test('401 → rejected без навигации', async () => {
		const { client, navigate } = scenario({ refresh: [status(401)] })
		assert.deepEqual(await client.refreshOnce(), { kind: 'rejected' })
		assert.equal(navigate.mock.calls.length, 0)
	})

	test.each(
		(
			[
				...[403, 429, 500, 502, 503].map((code) => ({ name: String(code), reply: () => status(code) })),
				{ name: 'исключение транспорта', reply: () => new TypeError('Failed to fetch') },
			] as { name: string; reply: () => Reply }[]
		).map((row): [string, { name: string; reply: () => Reply }] => [row.name, row])
	)('%s → unavailable', async (_name, { reply }) => {
		const { client } = scenario({ refresh: [reply()] })
		assert.deepEqual(await client.refreshOnce(), { kind: 'unavailable' })
	})
})

describe('loadMe', () => {
	test('200 с ok:true → ok с пользователем, права и срок access как в ответе', async () => {
		const { client, calls } = scenario({})
		const outcome = await client.loadMe()
		assert.equal(outcome.kind, 'ok')
		assert.ok(outcome.kind === 'ok')
		assert.equal(outcome.me.id, 'user-1')
		assert.deepEqual(outcome.me.perms, ['tests.read', 'tests.solve'])
		assert.deepEqual(outcome.me.roles, ['user'])
		assert.equal(outcome.me.accessExpiresAt, '2026-10-04T10:00:00.000Z')
		assert.equal(calls.refresh, 0)
	})

	test('401 → один refresh → повтор me → ok', async () => {
		const { client, calls, navigate } = scenario({ me: [status(401)] })
		const outcome = await client.loadMe()
		assert.equal(outcome.kind, 'ok')
		assert.equal(calls.refresh, 1)
		assert.equal(calls.me, 2)
		assert.equal(navigate.mock.calls.length, 0)
	})

	test('401 и refresh 401 → rejected без навигации', async () => {
		const { client, calls, navigate } = scenario({ me: [status(401)], refresh: [status(401)] })
		assert.deepEqual(await client.loadMe(), { kind: 'rejected' })
		assert.equal(calls.me, 1)
		assert.equal(navigate.mock.calls.length, 0)
	})

	test.each(
		(
			[
				{ name: 'refresh 500', refresh: () => status(500) },
				{ name: 'сбой сети при refresh', refresh: () => new TypeError('Failed to fetch') },
			] as { name: string; refresh: () => Reply }[]
		).map((row): [string, { name: string; refresh: () => Reply }] => [row.name, row])
	)('401 и %s → unavailable без навигации', async (_name, { refresh }) => {
		const { client, navigate } = scenario({ me: [status(401)], refresh: [refresh()] })
		assert.deepEqual(await client.loadMe(), { kind: 'unavailable' })
		assert.equal(navigate.mock.calls.length, 0)
	})

	test('401, успешный refresh и снова 401 → rejected без навигации', async () => {
		const { client, navigate } = scenario({ me: [status(401), status(401)] })
		assert.deepEqual(await client.loadMe(), { kind: 'rejected' })
		assert.equal(navigate.mock.calls.length, 0)
	})

	test.each(
		(
			[
				{ name: 'me отвечает 500', me: () => status(500) },
				{ name: 'transport.me бросает', me: () => new TypeError('Failed to fetch') },
			] as { name: string; me: () => Reply }[]
		).map((row): [string, { name: string; me: () => Reply }] => [row.name, row])
	)('%s → unavailable без refresh', async (_name, { me }) => {
		const { client, calls } = scenario({ me: [me()] })
		assert.deepEqual(await client.loadMe(), { kind: 'unavailable' })
		assert.equal(calls.refresh, 0)
	})

	test('200 с ok:false → rejected без refresh', async () => {
		const { client, calls } = scenario({ me: [status(200, { ok: false })] })
		assert.deepEqual(await client.loadMe(), { kind: 'rejected' })
		assert.equal(calls.refresh, 0)
	})
})

describe('тела отброшенных ответов дочитываются', () => {
	test('loadMe: тело 401 от me и от refresh прочитано', async () => {
		const me401 = status(401, { ok: false })
		const refresh401 = status(401, { ok: false })
		const { client } = scenario({ me: [me401], refresh: [refresh401] })
		assert.deepEqual(await client.loadMe(), { kind: 'rejected' })
		assert.equal(me401.bodyUsed, true)
		assert.equal(refresh401.bodyUsed, true)
	})

	test('loadMe: тело 500 от me и от refresh прочитано', async () => {
		const me500 = status(500, { ok: false })
		const me401 = status(401, { ok: false })
		const refresh500 = status(500, { ok: false })
		const first = scenario({ me: [me500] })
		await first.client.loadMe()
		assert.equal(me500.bodyUsed, true)
		const second = scenario({ me: [me401], refresh: [refresh500] })
		await second.client.loadMe()
		assert.equal(refresh500.bodyUsed, true)
	})

	test('fetchWithSession: исходный 401 прочитан после успешного повтора, ответ повтора нет', async () => {
		const original = status(401, { ok: false })
		const retry = status(200, { ok: true })
		const { client } = scenario({ request: [original, retry] })
		const response = await client.fetchWithSession('/a')
		assert.equal(response, retry)
		assert.equal(original.bodyUsed, true)
		assert.equal(retry.bodyUsed, false)
	})

	test('fetchWithSession: при отказе refresh тела 401 прочитаны', async () => {
		const original = status(401, { ok: false })
		const repeated = status(401, { ok: false })
		const second = status(401, { ok: false })
		const first = scenario({ request: [original], refresh: [status(401, { ok: false })] })
		await settle(first.client.fetchWithSession('/a'))
		assert.equal(original.bodyUsed, true)
		const other = scenario({ request: [repeated, second] })
		await settle(other.client.fetchWithSession('/a'))
		assert.equal(repeated.bodyUsed, true)
		assert.equal(second.bodyUsed, true)
	})

	test('fetchWithSession: при unavailable исходный 401 возвращается непрочитанным', async () => {
		const original = status(401, { ok: false })
		const { client } = scenario({ request: [original], refresh: [status(503, { ok: false })] })
		const response = await client.fetchWithSession('/a')
		assert.equal(response, original)
		assert.equal(original.bodyUsed, false)
	})

	test('logout: тело ответа прочитано', async () => {
		const reply = status(200, { ok: true })
		const { client } = scenario({ logout: [reply] })
		await client.logout()
		assert.equal(reply.bodyUsed, true)
	})
})

describe('parseAuthMe', () => {
	test('без поля или с не-строкой accessExpiresAt равен null', () => {
		assert.equal(parseAuthMe({ ok: true, user: { id: 'u' } })?.accessExpiresAt, null)
		assert.equal(parseAuthMe({ ok: true, accessExpiresAt: 1_790_000_000, user: { id: 'u' } })?.accessExpiresAt, null)
		assert.equal(
			parseAuthMe({ ok: true, user: { id: 'u', accessExpiresAt: '2026-10-04T10:00:00.000Z' } })?.accessExpiresAt,
			null
		)
	})
})

describe('logout', () => {
	test.each(
		(
			[
				{ name: 'вызывает transport.logout один раз', logout: () => [] },
				{ name: 'ответ 401 не считается ошибкой', logout: () => [status(401)] },
				{ name: 'ответ 500: сервер очищает cookie в любом случае, logout даёт true', logout: () => [status(500)] },
			] as { name: string; logout: () => Reply[] }[]
		).map((row): [string, { name: string; logout: () => Reply[] }] => [row.name, row])
	)('%s', async (_name, { logout }) => {
		const { client, calls } = scenario({ logout: logout() })
		assert.equal(await client.logout(), true)
		assert.equal(calls.logout, 1)
		assert.equal(calls.refresh, 0)
	})

	test('сбой сети даёт false', async () => {
		const { client } = scenario({ logout: [new TypeError('Failed to fetch')] })
		assert.equal(await client.logout(), false)
	})
})

describe('модуль по умолчанию', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.resetModules()
	})

	test('импорт без window не падает, apiFetch идёт через fetch того же origin', async () => {
		vi.resetModules()
		const requests: { url: string; init?: RequestInit }[] = []
		const replies = [status(401), status(200, { ok: true, accessExpiresAt: null }), status(200, { ok: true })]
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				requests.push({ url, init })
				return replies.shift() ?? status(500)
			})
		)
		const sessionModule = await import('./client')
		const requestModule = await import('@/lib/http/request')
		assert.equal(requestModule.AuthExpiredError, sessionModule.AuthExpiredError)
		const response = await sessionModule.apiFetch('/api/tests', { method: 'GET' })
		assert.equal(response.status, 200)
		assert.deepEqual(
			requests.map((r) => [r.url, r.init?.method ?? 'GET', r.init?.credentials]),
			[
				['/api/tests', 'GET', 'include'],
				['/api/auth/refresh', 'POST', 'include'],
				['/api/tests', 'GET', 'include'],
			]
		)
	})

	test('отказ refresh ведёт на логин через window.location с текущим путём', async () => {
		vi.resetModules()
		const assign = vi.fn()
		vi.stubGlobal('window', { location: { pathname: '/admin/users', search: '?tab=roles', assign } })
		const replies = [status(401), status(401)]
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => replies.shift() ?? status(500))
		)
		const { apiFetch } = await import('./client')
		const result = await settle(apiFetch('/api/users'))
		assert.ok(result.error instanceof Error)
		assert.equal(result.error.name, 'AuthExpiredError')
		assert.deepEqual(assign.mock.calls, [['/login?callbackUrl=%2Fadmin%2Fusers%3Ftab%3Droles']])
	})

	test('модуль веб-сессии не принимает решений о правах и не знает секрета JWT', () => {
		const dir = fileURLToPath(new URL('.', import.meta.url))
		for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
			const source = readFileSync(`${dir}${name}`, 'utf8')
			assert.doesNotMatch(source, /jsonwebtoken|AUTH_JWT_SECRET|@bio-exam\/rbac|\bcan\(|verify\(/, name)
		}
	})
})
