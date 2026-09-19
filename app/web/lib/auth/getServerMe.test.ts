import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from 'typescript'

import { parseAuthMe } from './authMePayload'
import type { ServerMe } from './getServerMe'
import { buildLoginRedirectPath } from './loginRedirect'

const root = resolve(__dirname, '../..')
const load = createRequire(resolve(__dirname, 'getServerMe.test.ts'))
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

type AuthModule = {
	getServerMe: () => Promise<ServerMe | null>
	isAuthenticated: () => Promise<boolean>
}

function compile(path: string) {
	return transpileModule(readFileSync(path, 'utf8'), {
		compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020, jsx: JsxEmit.ReactJSX },
	}).outputText
}

async function scenario(options: Options) {
	const requests: { url: string; init: RequestInit }[] = []
	let localImports = 0
	const auth = { exports: {} as AuthModule }
	const dependencies: Record<string, unknown> = {
		react: { cache: <T>(fn: T): T => fn },
		'server-only': {},
		'next/headers': { cookies: async () => ({ toString: () => options.cookie ?? 'bio_exam_session=valid' }) },
		'./authMePayload': { parseAuthMe },
	}
	runInNewContext(compile(resolve(root, 'lib/auth/getServerMe.ts')), {
		exports: auth.exports,
		module: auth,
		process: { env: { API_ORIGIN: options.origin } },
		URL,
		fetch: async (url: string | URL, init: RequestInit) => {
			requests.push({ url: String(url), init })
			if (options.failure) throw new Error('API unavailable')
			return new Response(options.rawBody ?? JSON.stringify(options.body ?? { ok: true, user }), {
				status: options.status ?? 200,
			})
		},
		require: (name: string) => {
			if (name === '@/lib/auth/server/getMeData') {
				localImports++
				return { getMeData: async () => options.local ?? null }
			}
			assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
			return dependencies[name]
		},
	})
	const me = await auth.exports.getServerMe()
	return { me, requests, localImports, auth: auth.exports }
}

async function profile(auth: AuthModule) {
	const page = { exports: {} as { default: (props: { params: Promise<{ id: string }> }) => Promise<unknown> } }
	const dependencies: Record<string, unknown> = {
		'react/jsx-runtime': load('react/jsx-runtime') as unknown,
		'next/navigation': {
			redirect: (url: string) => {
				throw new Error(`redirect:${url}`)
			},
			notFound: () => {
				throw new Error('not-found')
			},
		},
		'@/components/users/UserProfileAssignmentsPage': { default: 'student-profile' },
		'@/lib/auth/getServerMe': auth,
		'@/lib/auth/loginRedirect': { buildLoginRedirectPath },
	}
	runInNewContext(compile(resolve(root, 'app/(internal)/(protected)/profile/[id]/page.tsx')), {
		exports: page.exports,
		module: page,
		require: (name: string) => {
			assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
			return dependencies[name]
		},
	})
	return page.exports.default({ params: Promise.resolve({ id: 'student-login' }) })
}

async function main() {
	const api = await scenario({ origin: 'https://api.example.test' })
	assert.ok(api.me, 'API accepts the session, but server profile redirects to login')
	assert.deepEqual(api.me, user)
	await profile(api.auth)
	assert.equal(api.localImports, 0, 'API mode must not initialize the local JWT/DB implementation')
	assert.equal(api.requests[0].url, 'https://api.example.test/api/auth/me')
	assert.equal(api.requests[0].init.cache, 'no-store')
	assert.equal(api.requests[0].init.redirect, 'error')
	assert.equal(new Headers(api.requests[0].init.headers).get('cookie'), 'bio_exam_session=valid')
	assert.equal(await api.auth.isAuthenticated(), true)
	const trailing = await scenario({ origin: 'https://api.example.test/' })
	assert.equal(trailing.requests[0].url, 'https://api.example.test/api/auth/me')
	const emptyCookie = await scenario({ origin: 'https://api.example.test', cookie: '', body: { ok: false } })
	assert.equal(emptyCookie.me, null)
	assert.equal(new Headers(emptyCookie.requests[0].init.headers).get('cookie'), '')
	for (const options of [
		{ status: 401 },
		{ status: 403 },
		{ status: 500 },
		{ body: { ok: false } },
		{ body: { ok: true, user: {} } },
		{ failure: true },
		{ rawBody: 'invalid JSON' },
		{ origin: 'invalid-url' },
	]) {
		const denied = await scenario({ origin: 'https://api.example.test', local: user, ...options })
		assert.equal(denied.me, null)
		assert.equal(denied.localImports, 0, 'API denial must not fall back to local authentication')
		await assert.rejects(profile(denied.auth), /redirect:\/login/)
		assert.equal(await denied.auth.isAuthenticated(), false)
	}
	const student = await scenario({
		origin: 'https://api.example.test',
		body: { ok: true, user: { id: 'student', roles: ['student'] } },
	})
	await assert.rejects(profile(student.auth), /not-found/)
	const local = await scenario({ local: user })
	assert.equal(local.me?.id, user?.id)
	assert.equal(local.requests.length, 0)
	assert.equal(local.localImports, 1)
	assert.equal((await scenario({})).me, null)
	console.log(
		'PASS: API session opens student profile; denied sessions and non-admin access remain blocked; local mode preserved'
	)
}

void main()
