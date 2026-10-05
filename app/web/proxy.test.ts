import { NextRequest } from 'next/server'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import { proxy } from './proxy'

const API_ORIGIN = 'http://api.example.test'
const ACCESS = 'bio_exam_session'
const REFRESH = 'refresh_token'

function token(payload: Record<string, unknown>): string {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

function nowSec(): number {
	return Math.floor(Date.now() / 1000)
}

function accessToken(expInSec: number, sid: string | null = 'session-id'): string {
	return token({ sub: 'user-id', ...(sid ? { sid } : {}), exp: nowSec() + expInSec })
}

function request(
	path: string,
	cookies: Record<string, string> = {},
	headers: Record<string, string> = {}
): NextRequest {
	const cookie = Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join('; ')
	return new NextRequest(new URL(path, 'http://web.example.test'), {
		headers: cookie ? { ...headers, cookie } : headers,
	})
}

const SESSION_REFRESH_HEADER = 'x-session-refresh'

function overriddenHeaderNames(response: Response): string[] {
	return (response.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean)
}

function forwardedSessionRefresh(response: Response): string | null {
	return response.headers.get(`x-middleware-request-${SESSION_REFRESH_HEADER}`)
}

type Call = { url: string; init: RequestInit }

function stubFetch(handler: () => Response | Promise<Response>): Call[] {
	const calls: Call[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL, init: RequestInit) => {
			calls.push({ url: String(url), init })
			return handler()
		})
	)
	return calls
}

function refreshResponse(setCookies: string[], status = 200): Response {
	const headers = new Headers({ 'content-type': 'application/json' })
	for (const line of setCookies) headers.append('set-cookie', line)
	return new Response(JSON.stringify({ ok: status === 200 }), { status, headers })
}

const NEW_ACCESS = token({ sub: 'user-id', sid: 'session-id', exp: 4_102_444_800 })
const ROTATED_SET_COOKIES = [
	`${ACCESS}=${NEW_ACCESS}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`,
	`${REFRESH}=new-refresh; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
]

function isPassThrough(response: Response): boolean {
	return response.headers.get('x-middleware-next') === '1' && response.headers.get('location') === null
}

function requestCookieOverride(response: Response): string {
	return response.headers.get('x-middleware-request-cookie') ?? ''
}

function clearedNames(response: Response): string[] {
	return response.headers
		.getSetCookie()
		.filter((line) => /Max-Age=0/.test(line) && /Path=\//.test(line) && /^[^=]+=;/.test(line))
		.map((line) => line.slice(0, line.indexOf('=')))
}

beforeEach(() => {
	vi.stubEnv('API_ORIGIN', API_ORIGIN)
	vi.stubEnv('SESSION_COOKIE_NAME', ACCESS)
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

describe('proxy: refresh при SSR', () => {
	test('только refresh_token: один POST к Express, Set-Cookie переносятся, новый access уходит в запрос RSC', async () => {
		const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		const response = await proxy(request('/dashboard', { [REFRESH]: 'old-refresh' }))

		assert.equal(calls.length, 1)
		assert.equal(calls[0].url, `${API_ORIGIN}/api/auth/refresh`)
		assert.equal(calls[0].init.method, 'POST')
		assert.equal(calls[0].init.redirect, 'manual')
		assert.equal(calls[0].init.cache, 'no-store')
		assert.equal(new Headers(calls[0].init.headers).get('cookie'), `${REFRESH}=old-refresh`)

		assert.ok(isPassThrough(response))
		assert.deepEqual(response.headers.getSetCookie(), ROTATED_SET_COOKIES)
		const override = requestCookieOverride(response)
		assert.match(override, new RegExp(`${ACCESS}=${NEW_ACCESS.replace(/\./g, '\\.')}`))
		assert.match(override, new RegExp(`${REFRESH}=new-refresh`))
		assert.ok(response.headers.get('x-middleware-override-headers')?.split(',').includes('cookie'))
	})

	test.each<[string, string]>([['срок через 30 с', accessToken(30)]])(
		'access %s: refresh вызывается',
		async (_name, access) => {
			const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
			await proxy(request('/dashboard', { [ACCESS]: access, [REFRESH]: 'old-refresh' }))
			assert.equal(calls.length, 1)
		}
	)

	test('access истёк, но refresh_token нет: refresh не вызывается, запрос проходит', async () => {
		const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		const response = await proxy(request('/dashboard', { [ACCESS]: accessToken(-10) }))
		assert.equal(calls.length, 0)
		assert.ok(isPassThrough(response))
	})

	test('окно гонки: Express вернул только access, refresh_token запроса не меняется', async () => {
		const accessOnly = [`${ACCESS}=${NEW_ACCESS}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`]
		stubFetch(() => refreshResponse(accessOnly))
		const response = await proxy(request('/dashboard', { [REFRESH]: 'old-refresh' }))

		assert.ok(isPassThrough(response))
		assert.deepEqual(response.headers.getSetCookie(), accessOnly)
		const override = requestCookieOverride(response)
		assert.match(override, new RegExp(`${ACCESS}=`))
		assert.match(override, new RegExp(`${REFRESH}=old-refresh`))
	})

	test('значение cookie из Set-Cookie декодируется до подстановки в запрос', async () => {
		stubFetch(() => refreshResponse([`${REFRESH}=a%2Bb%3Dc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`]))
		const response = await proxy(request('/dashboard', { [REFRESH]: 'old-refresh' }))
		const cookie = new NextRequest('http://web.example.test/', {
			headers: { cookie: requestCookieOverride(response) },
		}).cookies.get(REFRESH)?.value
		assert.equal(cookie, 'a+b=c')
	})

	test('refresh 401 на защищённом пути: 307 на /login с callbackUrl и очистка обеих cookie', async () => {
		stubFetch(() => refreshResponse([], 401))
		const response = await proxy(request('/dashboard?tab=1', { [REFRESH]: 'revoked' }))

		assert.equal(response.status, 307)
		assert.equal(response.headers.get('location'), 'http://web.example.test/login?callbackUrl=%2Fdashboard%3Ftab%3D1')
		const cleared = clearedNames(response)
		assert.ok(cleared.includes(ACCESS), `cleared: ${cleared.join(', ')}`)
		assert.ok(cleared.includes(REFRESH), `cleared: ${cleared.join(', ')}`)
		for (const line of response.headers.getSetCookie()) {
			assert.match(line, /HttpOnly/)
			assert.match(line, /SameSite=Lax/)
		}
	})

	test.each(['/login', '/invite/abc'])(
		'refresh 401 на публичном пути %s: без редиректа, cookie очищаются',
		async (path) => {
			stubFetch(() => refreshResponse([], 401))
			const response = await proxy(request(path, { [REFRESH]: 'revoked' }))
			assert.ok(isPassThrough(response))
			const cleared = clearedNames(response)
			assert.ok(cleared.includes(ACCESS))
			assert.ok(cleared.includes(REFRESH))
		}
	)

	test.each<[string, () => Response]>([
		['502', () => refreshResponse([], 502)],
		['500', () => refreshResponse([], 500)],
		['403', () => refreshResponse([], 403)],
		['429', () => refreshResponse([], 429)],
		['302', () => new Response(null, { status: 302, headers: { location: '/elsewhere' } })],
		[
			'сбой сети',
			() => {
				throw new TypeError('fetch failed')
			},
		],
	])('refresh недоступен (%s): запрос проходит без редиректа и без очистки cookie', async (_name, handler) => {
		stubFetch(handler)
		const response = await proxy(request('/dashboard', { [REFRESH]: 'old-refresh' }))
		assert.ok(isPassThrough(response))
		assert.deepEqual(response.headers.getSetCookie(), [])
		const forwardedCookie = response.headers.get('x-middleware-request-cookie')
		assert.ok(forwardedCookie === null || forwardedCookie === `${REFRESH}=old-refresh`, `cookie: ${forwardedCookie}`)
		assert.equal(forwardedSessionRefresh(response), 'unavailable')
		assert.ok(overriddenHeaderNames(response).includes(SESSION_REFRESH_HEADER))
	})

	test('refresh недоступен: входящий x-session-refresh заменяется значением proxy', async () => {
		stubFetch(() => refreshResponse([], 502))
		const response = await proxy(
			request('/dashboard', { [REFRESH]: 'old-refresh' }, { [SESSION_REFRESH_HEADER]: 'spoofed' })
		)
		assert.ok(isPassThrough(response))
		assert.equal(forwardedSessionRefresh(response), 'unavailable')
	})

	test('запрос refresh идёт без signal и таймаута', async () => {
		const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		await proxy(request('/dashboard', { [REFRESH]: 'old-refresh' }))
		assert.equal(calls.length, 1)
		assert.equal('signal' in calls[0].init, false)
		assert.equal(calls[0].init.signal, undefined)
	})

	test('API_ORIGIN не задан и refresh нужен: proxy бросает ошибку про API_ORIGIN', async () => {
		vi.stubEnv('API_ORIGIN', '')
		const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		await assert.rejects(proxy(request('/dashboard', { [REFRESH]: 'old-refresh' })), /API_ORIGIN/)
		assert.equal(calls.length, 0)
	})
})

describe('proxy: без cookie', () => {
	test('API_ORIGIN не задан, refresh не нужен: proxy работает как раньше', async () => {
		vi.stubEnv('API_ORIGIN', '')
		const response = await proxy(request('/dashboard', { [ACCESS]: accessToken(600), [REFRESH]: 'r' }))
		assert.ok(isPassThrough(response))
	})
})

describe('proxy: входящий x-session-refresh вырезается', () => {
	function assertStripped(response: Response): void {
		assert.ok(isPassThrough(response))
		assert.equal(overriddenHeaderNames(response).includes(SESSION_REFRESH_HEADER), false)
		assert.ok(overriddenHeaderNames(response).length > 0, 'request headers are not overridden')
		assert.equal(forwardedSessionRefresh(response), null)
	}

	test('refresh успешен', async () => {
		stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		const response = await proxy(
			request('/dashboard', { [REFRESH]: 'old-refresh' }, { [SESSION_REFRESH_HEADER]: 'unavailable' })
		)
		assertStripped(response)
		assert.match(requestCookieOverride(response), new RegExp(`${REFRESH}=new-refresh`))
	})

	test('refresh 401 на публичном пути', async () => {
		stubFetch(() => refreshResponse([], 401))
		const response = await proxy(
			request('/login', { [REFRESH]: 'revoked' }, { [SESSION_REFRESH_HEADER]: 'unavailable' })
		)
		assertStripped(response)
		assert.ok(clearedNames(response).includes(REFRESH))
	})

	test('access действует, refresh не нужен', async () => {
		const calls = stubFetch(() => refreshResponse(ROTATED_SET_COOKIES))
		const response = await proxy(
			request(
				'/dashboard',
				{ [ACCESS]: accessToken(600), [REFRESH]: 'old-refresh' },
				{ [SESSION_REFRESH_HEADER]: 'unavailable' }
			)
		)
		assert.equal(calls.length, 0)
		assertStripped(response)
	})

	test.each(['/login', '/invite/token'])('%s без cookie', async (path) => {
		const response = await proxy(request(path, {}, { accept: 'text/html', [SESSION_REFRESH_HEADER]: 'unavailable' }))
		assertStripped(response)
	})

	test('без входящего заголовка заголовки запроса не переписываются', async () => {
		const response = await proxy(request('/dashboard', { [ACCESS]: accessToken(600), [REFRESH]: 'r' }))
		assert.ok(isPassThrough(response))
		assert.equal(response.headers.get('x-middleware-override-headers'), null)
	})
})
