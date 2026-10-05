import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

import { parseAuthMe } from '@/lib/auth/authMePayload'

const holders = vi.hoisted(() => ({
	cookie: 'bio_exam_session=valid',
	requestHeaders: {} as Record<string, string>,
}))

vi.mock('server-only', () => ({}))
vi.mock('react', async (importOriginal) => ({
	...(await importOriginal<typeof import('react')>()),
	cache: <T>(fn: T): T => fn,
}))
vi.mock('next/headers', () => ({
	cookies: async () => ({ toString: () => holders.cookie }),
	headers: async () => new Headers(holders.requestHeaders),
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
vi.mock('@/components/tests/AttemptReview', () => ({ default: 'attempt-review' }))
vi.mock('@/components/auth/AccessDeniedState', () => ({ AccessDeniedState: 'access-denied' }))

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
	refreshUnavailable?: boolean
}

type BodyTrack = { drained: boolean; cancels: number }

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

function trackedResponse(text: string, status: number, track: BodyTrack): Response {
	const bytes = new TextEncoder().encode(text)
	let sent = false
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (!sent) {
				sent = true
				controller.enqueue(bytes)
				return
			}
			track.drained = true
			controller.close()
		},
		cancel() {
			track.cancels += 1
		},
	})
	return new Response(stream, { status })
}

async function load(options: Options) {
	const requests: { url: string; init: RequestInit }[] = []
	const bodies: BodyTrack[] = []
	holders.cookie = options.cookie ?? 'bio_exam_session=valid'
	holders.requestHeaders = options.refreshUnavailable ? { 'x-session-refresh': 'unavailable' } : {}
	vi.resetModules()
	vi.stubEnv('API_ORIGIN', 'origin' in options ? options.origin : 'https://api.example.test')
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL, init: RequestInit) => {
			requests.push({ url: String(url), init })
			if (options.failure) throw new TypeError('fetch failed')
			const track: BodyTrack = { drained: false, cancels: 0 }
			bodies.push(track)
			return trackedResponse(
				options.rawBody ??
					JSON.stringify(options.body ?? { ok: true, user: ADMIN, accessExpiresAt: admin!.accessExpiresAt }),
				options.status ?? 200,
				track
			)
		})
	)
	const server = await import('./server')
	return { requests, bodies, server }
}

function assertBodiesDrained(bodies: BodyTrack[]) {
	assert.ok(bodies.length > 0)
	for (const body of bodies) {
		assert.equal(body.drained, true)
		assert.equal(body.cancels, 0)
	}
}

async function profile() {
	const page = await import('../../app/(internal)/(protected)/profile/[id]/page')
	return page.default({ params: Promise.resolve({ id: 'student-login' }) })
}

async function attemptPage(id: string) {
	const page = await import('../../app/(internal)/(protected)/admin/attempts/[id]/page')
	return page.default({ params: Promise.resolve({ id }) })
}

const parseRecord = (body: unknown) => {
	if (!body || typeof body !== 'object') throw new Error('not an object')
	return body as Record<string, unknown>
}

test('serverRequest: URL от API_ORIGIN, cookie запроса, no-store, redirect error', async () => {
	const { requests, bodies, server } = await load({ body: { value: 1 } })
	const outcome = await server.serverRequest('/api/things?limit=5', { parse: parseRecord })
	assert.deepEqual(outcome, { kind: 'ok', data: { value: 1 } })
	assert.equal(requests.length, 1)
	assert.equal(requests[0].url, 'https://api.example.test/api/things?limit=5')
	assert.equal(requests[0].init.cache, 'no-store')
	assert.equal(requests[0].init.redirect, 'error')
	assert.equal(new Headers(requests[0].init.headers).get('cookie'), 'bio_exam_session=valid')
	assertBodiesDrained(bodies)
})

test.each<[string, string]>([
	['без /api/', '/things'],
	['протокол-относительный', '//evil.example.test/api/x'],
	['абсолютный URL', 'https://evil.example.test/api/x'],
	['выход из /api/ точками', '/api/../internal'],
])('serverRequest: путь %s отклоняется до запроса', async (_name, path) => {
	const { requests, server } = await load({})
	await assert.rejects(server.serverRequest(path as `/api/${string}`, { parse: parseRecord }))
	assert.equal(requests.length, 0)
})

test.each<[string, Options, Record<string, unknown>]>([
	['401', { status: 401, body: { error: 'Unauthorized' } }, { kind: 'unauthorized' }],
	[
		'401 при недоступном refresh',
		{ status: 401, body: { error: 'Unauthorized' }, refreshUnavailable: true },
		{ kind: 'error', status: 401 },
	],
	['403', { status: 403, body: { error: 'Forbidden' } }, { kind: 'denied' }],
	['404', { status: 404, body: { error: 'Not found' } }, { kind: 'missing' }],
	['400', { status: 400, body: { error: 'Invalid id' } }, { kind: 'error', status: 400 }],
	['500', { status: 500, body: { error: 'Internal' } }, { kind: 'error', status: 500 }],
	['502 с HTML', { status: 502, rawBody: '<html>Bad Gateway</html>' }, { kind: 'error', status: 502 }],
])('serverRequest: %s — исход по статусу, тело прочитано без cancel', async (_name, options, expected) => {
	const { bodies, server } = await load(options)
	const outcome = await server.serverRequest('/api/things', { parse: parseRecord })
	assert.deepEqual(outcome, expected)
	assertBodiesDrained(bodies)
})

test('serverRequest: 200 с некорректным JSON — error, тело прочитано', async () => {
	const { bodies, server } = await load({ rawBody: 'not json' })
	const outcome = await server.serverRequest('/api/things', { parse: parseRecord })
	assert.equal(outcome.kind, 'error')
	assert.equal(outcome.kind === 'error' ? outcome.status : undefined, 200)
	assertBodiesDrained(bodies)
})

test('serverRequest: parse бросил — error, тело прочитано', async () => {
	const { bodies, server } = await load({ body: 'string body' })
	const outcome = await server.serverRequest('/api/things', { parse: parseRecord })
	assert.equal(outcome.kind, 'error')
	assertBodiesDrained(bodies)
})

test('serverRequest: fetch бросил — error с cause', async () => {
	const { server } = await load({ failure: true })
	const outcome = await server.serverRequest('/api/things', { parse: parseRecord })
	assert.equal(outcome.kind, 'error')
	assert.ok(outcome.kind === 'error' && outcome.cause instanceof TypeError)
	assert.equal(outcome.kind === 'error' ? outcome.status : 'none', undefined)
})

test('requireServerData: ok отдаёт данные', async () => {
	const { server } = await load({})
	assert.deepEqual(server.requireServerData({ kind: 'ok', data: { a: 1 } }, '/admin/attempts'), { a: 1 })
})

test('requireServerData: unauthorized уводит на вход с возвратом', async () => {
	const { server } = await load({})
	assert.throws(
		() => server.requireServerData({ kind: 'unauthorized' }, '/admin/attempts'),
		/redirect:\/login\?callbackUrl=%2Fadmin%2Fattempts$/
	)
})

test.each<['denied' | 'missing']>([['denied'], ['missing']])('requireServerData: %s — not-found', async (kind) => {
	const { server } = await load({})
	assert.throws(() => server.requireServerData({ kind }, '/admin/attempts'), /^Error: not-found$/)
})

test('requireServerData: error — исключение без текста тела', async () => {
	const { server } = await load({})
	assert.throws(
		() => server.requireServerData({ kind: 'error', status: 500, cause: new Error('secret body') }, '/admin/attempts'),
		(error: Error) => /500/.test(error.message) && !/secret body/.test(error.message) && error.cause === undefined
	)
})

test('getServerMe: API принял сессию, один запрос к Express с cookie запроса', async () => {
	const { requests, bodies, server } = await load({})
	const me = await server.getServerMe()
	assert.deepEqual(me, admin)
	assert.equal(requests.length, 1)
	assert.equal(requests[0].url, 'https://api.example.test/api/auth/me')
	assert.equal(requests[0].init.cache, 'no-store')
	assert.equal(requests[0].init.redirect, 'error')
	assert.equal(new Headers(requests[0].init.headers).get('cookie'), 'bio_exam_session=valid')
	assertBodiesDrained(bodies)
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
	const { bodies, server } = await load({ status: 401, body: { error: 'Unauthorized' } })
	assert.equal(await server.getServerMe(), null)
	assertBodiesDrained(bodies)
	await assert.rejects(profile(), /redirect:\/login\?callbackUrl=%2Fprofile%2Fstudent-login$/)
})

test('getServerMe: 401 при недоступном refresh тоже даёт null, тело прочитано', async () => {
	const { bodies, server } = await load({ status: 401, body: { error: 'Unauthorized' }, refreshUnavailable: true })
	assert.equal(await server.getServerMe(), null)
	assertBodiesDrained(bodies)
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
	['404', { status: 404, body: { error: 'Not found' } }],
	['500', { status: 500, body: { error: 'Internal' } }],
	['502', { status: 502, rawBody: 'Bad Gateway' }],
	['сбой fetch', { failure: true }],
	['неразбираемый JSON', { rawBody: 'invalid JSON' }],
])('getServerMe: %s — ошибка, а не null', async (_name, options) => {
	const { requests, bodies, server } = await load(options)
	await assert.rejects(server.getServerMe())
	assert.equal(requests.length, 1)
	if (!options.failure) assertBodiesDrained(bodies)
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

test('профиль: без права tests.manage_assignments — not-found', async () => {
	await load({ body: { ok: true, user: { id: 'student', roles: ['user'], perms: ['tests.read'] } } })
	await assert.rejects(profile(), /not-found/)
})

test('профиль: роль admin без права tests.manage_assignments — not-found', async () => {
	await load({ body: { ok: true, user: { id: 'admin-id', roles: ['admin'], perms: ['users.read', 'tests.read'] } } })
	await assert.rejects(profile(), /not-found/)
})

test('профиль: право tests.manage_assignments без роли admin открывает чужой профиль', async () => {
	await load({ body: { ok: true, user: { id: 'teacher', roles: ['user'], perms: ['tests.manage_assignments'] } } })
	const rendered = await profile()
	assert.ok(rendered)
})

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111'

test('страница попытки: запрос через serverRequest, 200 рисует разбор', async () => {
	const { requests, bodies } = await load({ body: { attempt: { id: ATTEMPT_ID }, questions: [] } })
	const rendered = (await attemptPage(ATTEMPT_ID)) as { type: unknown; props: Record<string, unknown> }
	assert.equal(requests[0].url, `https://api.example.test/api/tests/admin/attempts/${ATTEMPT_ID}`)
	assert.equal(rendered.type, 'attempt-review')
	assert.deepEqual(rendered.props.questions, [])
	assertBodiesDrained(bodies)
})

test('страница попытки: 403 — AccessDeniedState «Нет доступа к попытке»', async () => {
	await load({ status: 403, body: { error: 'Forbidden' } })
	const rendered = (await attemptPage(ATTEMPT_ID)) as { type: unknown; props: Record<string, unknown> }
	assert.equal(rendered.type, 'access-denied')
	assert.equal(rendered.props.title, 'Нет доступа к попытке')
	assert.equal(rendered.props.backHref, '/admin/attempts')
})

test('страница попытки: 404 — not-found', async () => {
	await load({ status: 404, body: { error: 'Not found' } })
	await assert.rejects(attemptPage(ATTEMPT_ID), /^Error: not-found$/)
})

test('страница попытки: 401 — вход с возвратом на попытку', async () => {
	await load({ status: 401, body: { error: 'Unauthorized' } })
	await assert.rejects(attemptPage(ATTEMPT_ID), /redirect:\/login\?callbackUrl=%2Fadmin%2Fattempts%2F11111111-/)
})

test.each<[string, Options]>([
	['400', { status: 400, body: { error: 'Invalid id' } }],
	['500', { status: 500, body: { error: 'Internal' } }],
	['401 при недоступном refresh', { status: 401, body: { error: 'Unauthorized' }, refreshUnavailable: true }],
	['конверт без questions', { body: { attempt: { id: ATTEMPT_ID } } }],
	['сбой fetch', { failure: true }],
])('страница попытки: %s — исключение для страницы ошибки', async (_name, options) => {
	await load(options)
	await assert.rejects(attemptPage(ATTEMPT_ID), (error: Error) => !/redirect:|not-found/.test(error.message))
})

test('модуль экспортирует только примитив, разбор исхода и getServerMe', async () => {
	const { server } = await load({})
	assert.deepEqual(Object.keys(server).sort(), ['getServerMe', 'requireServerData', 'serverRequest'])
})
