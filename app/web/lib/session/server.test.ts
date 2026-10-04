import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { parseAuthMe } from '@/lib/auth/authMePayload'

const holders = vi.hoisted(() => ({ cookie: 'bio_exam_session=valid' }))

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
vi.mock('@/components/users/UserProfileAssignmentsPage', () => ({ default: 'student-profile' }))

const ADMIN = {
	id: 'admin-id',
	login: 'admin',
	roles: ['admin'],
	perms: ['users.read', 'tests.manage_assignments'],
}
const admin = parseAuthMe({ ok: true, user: ADMIN, accessExpiresAt: '2030-01-01T00:00:00.000Z' })
assert.ok(admin)

type Options = {
	origin?: string
	cookie?: string
	status?: number
	body?: unknown
	rawBody?: string
	failure?: boolean
}

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

async function load(options: Options) {
	const requests: { url: string; init: RequestInit }[] = []
	holders.cookie = options.cookie ?? 'bio_exam_session=valid'
	vi.resetModules()
	vi.stubEnv('API_ORIGIN', 'origin' in options ? options.origin : 'https://api.example.test')
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL, init: RequestInit) => {
			requests.push({ url: String(url), init })
			if (options.failure) throw new TypeError('fetch failed')
			return new Response(
				options.rawBody ??
					JSON.stringify(options.body ?? { ok: true, user: ADMIN, accessExpiresAt: admin!.accessExpiresAt }),
				{ status: options.status ?? 200 }
			)
		})
	)
	const server = await import('./server')
	return { requests, server }
}

async function profile() {
	const page = await import('../../app/(internal)/(protected)/profile/[id]/page')
	return page.default({ params: Promise.resolve({ id: 'student-login' }) })
}

test('getServerMe: API принял сессию, один запрос к Express с cookie запроса', async () => {
	const { requests, server } = await load({})
	const me = await server.getServerMe()
	assert.deepEqual(me, admin)
	assert.equal(requests.length, 1)
	assert.equal(requests[0].url, 'https://api.example.test/api/auth/me')
	assert.equal(requests[0].init.cache, 'no-store')
	assert.equal(requests[0].init.redirect, 'error')
	assert.equal(new Headers(requests[0].init.headers).get('cookie'), 'bio_exam_session=valid')
})

test('getServerMe: администратор с правом tests.manage_assignments открывает чужой профиль', async () => {
	await load({})
	const rendered = await profile()
	assert.ok(rendered)
})

test('getServerMe: завершающий слэш в API_ORIGIN нормализуется', async () => {
	const { requests, server } = await load({ origin: 'https://api.example.test/' })
	await server.getServerMe()
	assert.equal(requests[0].url, 'https://api.example.test/api/auth/me')
})

test('getServerMe: пустой cookie пересылается как есть', async () => {
	const { requests, server } = await load({ cookie: '', status: 401, body: { error: 'Unauthorized' } })
	assert.equal(await server.getServerMe(), null)
	assert.equal(new Headers(requests[0].init.headers).get('cookie'), '')
})

test('getServerMe: 401 даёт null, профиль по чужому логину уводит на /login с callbackUrl', async () => {
	const { server } = await load({ status: 401, body: { error: 'Unauthorized' } })
	assert.equal(await server.getServerMe(), null)
	await assert.rejects(profile(), /redirect:\/login\?callbackUrl=%2Fprofile%2Fstudent-login$/)
})

test.each<[string, Options]>([
	['200 с ok:false', { body: { ok: false } }],
	['200 без user.id', { body: { ok: true, user: {} } }],
	['200 без user', { body: { ok: true } }],
])('getServerMe: %s даёт null', async (_name, options) => {
	const { server } = await load(options)
	assert.equal(await server.getServerMe(), null)
})

test.each<[string, Options]>([
	['403', { status: 403, body: { error: 'Forbidden' } }],
	['500', { status: 500, body: { error: 'Internal' } }],
	['502', { status: 502, rawBody: 'Bad Gateway' }],
	['сбой fetch', { failure: true }],
	['неразбираемый JSON', { rawBody: 'invalid JSON' }],
])('getServerMe: %s — ошибка, а не null', async (_name, options) => {
	const { requests, server } = await load(options)
	await assert.rejects(server.getServerMe())
	assert.equal(requests.length, 1)
	await assert.rejects(profile(), (error: Error) => !/redirect:|not-found/.test(error.message))
})

test.each<[string, string | undefined]>([
	['не задан', undefined],
	['пустой', ''],
	['невалидный', 'invalid-url'],
	['не http', 'ftp://api.example.test'],
])('getServerMe: API_ORIGIN %s — ошибка конфигурации без запроса', async (_name, origin) => {
	const { requests, server } = await load({ origin })
	await assert.rejects(server.getServerMe(), /API_ORIGIN/)
	assert.equal(requests.length, 0)
})

test('профиль: пользователь без роли admin получает not-found', async () => {
	await load({ body: { ok: true, user: { id: 'student', roles: ['student'], perms: ['tests.read'] } } })
	await assert.rejects(profile(), /not-found/)
})

test('модуль не содержит локальной реализации getMeData и isAuthenticated', async () => {
	const { server } = await load({})
	assert.deepEqual(Object.keys(server).sort(), ['getServerMe'])
})
