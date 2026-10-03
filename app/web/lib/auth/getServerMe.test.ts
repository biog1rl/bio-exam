import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { parseAuthMe } from './authMePayload'
import type { ServerMe } from './getServerMe'

// Состояние, которое сценарий задаёт до вызова getServerMe: cookie и ответ локального getMeData
const holders = vi.hoisted(() => ({
	cookie: 'bio_exam_session=valid',
	getMeData: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('react', async (importOriginal) => ({
	...(await importOriginal<typeof import('react')>()),
	cache: <T>(fn: T): T => fn,
}))
vi.mock('next/headers', () => ({
	cookies: async () => ({ toString: () => holders.cookie }),
}))
vi.mock('next/navigation', () => ({
	redirect: (url: string) => {
		throw new Error(`redirect:${url}`)
	},
	notFound: () => {
		throw new Error('not-found')
	},
}))
vi.mock('@/lib/auth/server/getMeData', () => ({ getMeData: holders.getMeData }))
vi.mock('@/components/users/UserProfileAssignmentsPage', () => ({ default: 'student-profile' }))

const user = parseAuthMe({ ok: true, user: { id: 'admin-id', roles: ['admin'], perms: ['users.read'] } })
assert.ok(user)

type Options = {
	origin?: string
	cookie?: string
	status?: number
	body?: unknown
	rawBody?: string
	failure?: boolean
	local?: ServerMe | null
}

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

async function scenario(options: Options) {
	const requests: { url: string; init: RequestInit }[] = []
	holders.cookie = options.cookie ?? 'bio_exam_session=valid'
	holders.getMeData.mockReset()
	holders.getMeData.mockImplementation(async () => options.local ?? null)
	vi.resetModules()
	vi.stubEnv('API_ORIGIN', options.origin)
	const fetchMock = vi.fn(async (url: string | URL, init: RequestInit) => {
		requests.push({ url: String(url), init })
		if (options.failure) throw new Error('API unavailable')
		return new Response(options.rawBody ?? JSON.stringify(options.body ?? { ok: true, user }), {
			status: options.status ?? 200,
		})
	})
	vi.stubGlobal('fetch', fetchMock)
	const auth = await import('./getServerMe')
	const me = await auth.getServerMe()
	return { me, requests, localCalls: holders.getMeData.mock.calls.length, auth }
}

// Страница импортируется после сценария без resetModules, поэтому получает тот же экземпляр getServerMe
async function profile() {
	const page = await import('../../app/(internal)/(protected)/profile/[id]/page')
	return page.default({ params: Promise.resolve({ id: 'student-login' }) })
}

test('getServerMe: сессия принята API, профиль открывается, локальная реализация не вызывается', async () => {
	const api = await scenario({ origin: 'https://api.example.test' })
	assert.ok(api.me, 'API accepts the session, but server profile redirects to login')
	assert.deepEqual(api.me, user)
	await profile()
	assert.equal(api.localCalls, 0, 'API mode must not initialize the local JWT/DB implementation')
	assert.equal(api.requests[0].url, 'https://api.example.test/api/auth/me')
	assert.equal(api.requests[0].init.cache, 'no-store')
	assert.equal(api.requests[0].init.redirect, 'error')
	assert.equal(new Headers(api.requests[0].init.headers).get('cookie'), 'bio_exam_session=valid')
	assert.equal(await api.auth.isAuthenticated(), true)
})

test('getServerMe: завершающий слэш в API_ORIGIN нормализуется', async () => {
	const trailing = await scenario({ origin: 'https://api.example.test/' })
	assert.equal(trailing.requests[0].url, 'https://api.example.test/api/auth/me')
})

test('getServerMe: пустой cookie пересылается как есть, ok:false даёт null', async () => {
	const emptyCookie = await scenario({ origin: 'https://api.example.test', cookie: '', body: { ok: false } })
	assert.equal(emptyCookie.me, null)
	assert.equal(new Headers(emptyCookie.requests[0].init.headers).get('cookie'), '')
})

test.each<[string, Options]>([
	['статус 401', { status: 401 }],
	['статус 403', { status: 403 }],
	['статус 500', { status: 500 }],
	['ok:false', { body: { ok: false } }],
	['ok:true с пустым user', { body: { ok: true, user: {} } }],
	['сбой fetch', { failure: true }],
	['невалидный JSON', { rawBody: 'invalid JSON' }],
	['невалидный origin', { origin: 'invalid-url' }],
])('getServerMe: отказ API (%s) даёт null, редирект на /login и без локального fallback', async (_name, options) => {
	const denied = await scenario({ origin: 'https://api.example.test', local: user, ...options })
	assert.equal(denied.me, null)
	assert.equal(denied.localCalls, 0, 'API denial must not fall back to local authentication')
	await assert.rejects(profile(), /redirect:\/login/)
	assert.equal(await denied.auth.isAuthenticated(), false)
})

test('профиль: пользователь без роли admin получает not-found', async () => {
	await scenario({
		origin: 'https://api.example.test',
		body: { ok: true, user: { id: 'student', roles: ['student'] } },
	})
	await assert.rejects(profile(), /not-found/)
})

test('getServerMe: локальный режим без API_ORIGIN делает один локальный вызов и ни одного запроса', async () => {
	const local = await scenario({ local: user })
	assert.equal(local.me?.id, user?.id)
	assert.equal(local.requests.length, 0)
	assert.equal(local.localCalls, 1)
})

test('getServerMe: пустое окружение без локального пользователя даёт null', async () => {
	assert.equal((await scenario({})).me, null)
})
