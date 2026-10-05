import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const SERVER_ROOT = 'app/server/src'
const WEB_ROOT = 'app/web'
const COOKIES_FILE = 'app/server/src/services/session/cookies.ts'
const APP_LAYOUT_FILE = 'app/web/components/AppLayout/AppLayout.tsx'
const AUTH_PROVIDER_FILE = 'app/web/components/providers/AuthProvider.tsx'
const ROOT_LAYOUT_FILE = 'app/web/app/layout.tsx'
const PROXY_REFRESH_FILE = 'app/web/lib/session/proxy-refresh.ts'

const REMOVED_FILES = [
	'app/web/app/api/auth/me/route.ts',
	'app/web/lib/auth/server/getMeData.ts',
	'app/web/lib/env/server.ts',
	'app/server/src/services/rbac/rbac.ts',
	'app/server/src/middleware/auth/basic-admin.ts',
]

const READ_COOKIE_DEFINITION = /\b(?:function\s+readCookie\b|(?:const|let|var)\s+readCookie\b)/
const APPEND_COOKIE_DEFINITION = /\b(?:function\s+appendSetCookie\b|(?:const|let|var)\s+appendSetCookie\b)/
const SET_COOKIE_HEADER_WRITE = /\.(?:setHeader|appendHeader|set|append)\(\s*['"\x60]set-cookie['"\x60]/i
const GET_SET_COOKIE = /\.getSetCookie\s*\(/
const AUTH_PROVIDER_MOUNT = /<AuthProvider\b|createElement\(\s*AuthProvider\b/
const APP_LAYOUT_MOUNT = /<AppLayout\b|createElement\(\s*AppLayout\b/

function collectSources(relativeDir) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(path.join(dir, entry.name))
		}
	}
	walk(path.join(REPO_ROOT, relativeDir))
	return files.sort()
}

function relativePath(file) {
	return path.relative(REPO_ROOT, file).split(path.sep).join('/')
}

function filesMatching(root, pattern) {
	const hits = []
	for (const file of collectSources(root)) {
		const source = fs.readFileSync(file, 'utf8')
		if (source.split('\n').some((line) => pattern.test(line))) hits.push(relativePath(file))
	}
	return hits
}

test('детекторы дублей видят объявления помощников и ручную запись Set-Cookie (проба-нарушение)', () => {
	for (const text of [
		'function readCookie(req, name) {}',
		'export function readCookie(req: Request, name: string) {}',
		'const readCookie = (req, name) => null',
	]) {
		assert.ok(READ_COOKIE_DEFINITION.test(text), text)
	}
	assert.ok(!READ_COOKIE_DEFINITION.test('const value = readCookie(req, ACCESS_COOKIE)'))
	assert.ok(APPEND_COOKIE_DEFINITION.test('function appendSetCookie(res, cookie) {}'))
	assert.ok(!APPEND_COOKIE_DEFINITION.test('appendSetCookie(res, cookie)'))
	for (const text of [
		"res.setHeader('Set-Cookie', [cookie])",
		'res.setHeader("set-cookie", cookie)',
		"response.headers.append('set-cookie', line)",
	]) {
		assert.ok(SET_COOKIE_HEADER_WRITE.test(text), text)
	}
	assert.ok(!SET_COOKIE_HEADER_WRITE.test("res.setHeader('Content-Type', 'text/plain')"))
	assert.ok(AUTH_PROVIDER_MOUNT.test('<AuthProvider initialMe={me}>'))
	assert.ok(AUTH_PROVIDER_MOUNT.test('createElement(AuthProvider, { initialMe })'))
	assert.ok(!AUTH_PROVIDER_MOUNT.test('import { AuthProvider } from "x"'))
	assert.ok(!AUTH_PROVIDER_MOUNT.test('export function AuthProvider({'))
	assert.ok(APP_LAYOUT_MOUNT.test('<AppLayout>{children}</AppLayout>'))
})

test('readCookie и appendSetCookie объявлены один раз, в services/session/cookies.ts (AUTH-07)', () => {
	assert.ok(fs.existsSync(path.join(REPO_ROOT, COOKIES_FILE)), COOKIES_FILE)
	assert.deepEqual(filesMatching(SERVER_ROOT, READ_COOKIE_DEFINITION), [COOKIES_FILE])
	assert.deepEqual(filesMatching(SERVER_ROOT, APPEND_COOKIE_DEFINITION), [COOKIES_FILE])
	assert.deepEqual(filesMatching(WEB_ROOT, READ_COOKIE_DEFINITION), [])
	assert.deepEqual(filesMatching(WEB_ROOT, APPEND_COOKIE_DEFINITION), [])
})

test('сервер пишет Set-Cookie только через appendSetCookie из cookies.ts (AUTH-07)', () => {
	const source = fs.readFileSync(path.join(REPO_ROOT, COOKIES_FILE), 'utf8')
	assert.match(source, /setHeader\(\s*['"]Set-Cookie['"]/)
	const writers = filesMatching(SERVER_ROOT, SET_COOKIE_HEADER_WRITE).filter(
		(file) => file !== COOKIES_FILE && !file.startsWith('app/server/src/test-support/')
	)
	assert.deepEqual(writers, [])
})

test('web собирает Set-Cookie ответа refresh в одном месте: lib/session/proxy-refresh.ts (AUTH-07)', () => {
	assert.deepEqual(filesMatching(WEB_ROOT, GET_SET_COOKIE), [PROXY_REFRESH_FILE])
})

test('удалённые файлы web-маршрута me, getMeData, пула и RBAC-слоя не вернулись (AUTH-08)', () => {
	for (const file of REMOVED_FILES) assert.ok(!fs.existsSync(path.join(REPO_ROOT, file)), `вернулся ${file}`)
	for (const root of [WEB_ROOT, SERVER_ROOT]) {
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
					continue
				}
				assert.ok(!/^getMeData\./.test(entry.name), `вернулся ${relativePath(path.join(dir, entry.name))}`)
			}
		}
		walk(path.join(REPO_ROOT, root))
	}
	assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'app/web/app/api')), 'вернулся каталог app/web/app/api')
})

test('AuthProvider монтируется один раз, в AppLayout, а AppLayout один раз в корневом layout (AUTH-10)', () => {
	const mounts = filesMatching(WEB_ROOT, AUTH_PROVIDER_MOUNT).filter((file) => file !== AUTH_PROVIDER_FILE)
	assert.deepEqual(mounts, [APP_LAYOUT_FILE])
	assert.deepEqual(filesMatching(WEB_ROOT, APP_LAYOUT_MOUNT), [ROOT_LAYOUT_FILE])
	const layout = fs.readFileSync(path.join(REPO_ROOT, APP_LAYOUT_FILE), 'utf8')
	assert.equal(layout.match(/<AuthProvider\b/g)?.length, 1)
	const root = fs.readFileSync(path.join(REPO_ROOT, ROOT_LAYOUT_FILE), 'utf8')
	assert.equal(root.match(/<AppLayout\b/g)?.length, 1)
})
