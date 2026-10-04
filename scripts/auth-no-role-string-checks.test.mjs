import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = ['app/server/src/routes', 'app/server/src/middleware', 'app/server/src/services']
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const ROLE_LITERAL = String.raw`['"\x60](?:admin|user|teacher)['"\x60]`

const ROLE_STRING_CHECKS = [
	{ label: 'roles с .includes( или .some(', pattern: /\broles\b[\w$?!.[\]]*\.(?:includes|some)\(/ },
	{ label: 'членство литерала роли через .includes(', pattern: new RegExp(String.raw`\.includes\(\s*${ROLE_LITERAL}`) },
	{ label: 'сравнение с литералом роли', pattern: new RegExp(String.raw`[!=]==?\s*${ROLE_LITERAL}`) },
	{ label: 'литерал роли слева от сравнения', pattern: new RegExp(String.raw`${ROLE_LITERAL}\s*[!=]==?`) },
	{ label: 'литерал роли teacher', pattern: /['"\x60]teacher['"\x60]/ },
	{ label: 'SQL-сравнение roleKey с литералом', pattern: /roleKey\}\s*=\s*'/ },
]

const SERVER_EXCEPTIONS = [
	{
		file: 'app/server/src/routes/tests/index.ts',
		reason: 'studentOnly: SQL-фильтр статистики исключает попытки admin',
		fragment: '${userRoles.roleKey} = \u0027admin\u0027',
		count: 2,
	},
	{
		file: 'app/server/src/routes/rbac/index.ts',
		reason: 'защита конфигурации admin: гранты роли admin не меняются',
		fragment: 'if (roleKey === \u0027admin\u0027)',
		count: 2,
	},
	{
		file: 'app/server/src/routes/rbac/index.ts',
		reason: 'защита конфигурации admin: переопределения пользователя-admin не меняются',
		fragment: 'rs.some((r) => r.role === \u0027admin\u0027)',
		count: 1,
	},
]

const WEB_ROOT = 'app/web'
const SECRET_ENV_KEYS = String.raw`(?:DATABASE_URL|AUTH_JWT_SECRET)`

const WEB_CHECKS = [
	{
		label: 'импорт pg или jsonwebtoken',
		pattern: /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"\x60](?:pg|jsonwebtoken)(?:\/[^'"\x60]*)?['"\x60]/,
	},
	{
		label: 'чтение process.env DATABASE_URL или AUTH_JWT_SECRET',
		pattern: new RegExp(
			String.raw`process\.env(?:\??\.\s*${SECRET_ENV_KEYS}\b|\[\s*['"\x60]${SECRET_ENV_KEYS}['"\x60]\s*\])`
		),
	},
	{
		label: 'деструктуризация DATABASE_URL или AUTH_JWT_SECRET из process.env',
		pattern: new RegExp(String.raw`\{[^}]*\b${SECRET_ENV_KEYS}\b[^}]*\}\s*=\s*process\.env\b`),
	},
	{ label: 'проверка isAdmin', pattern: /\bisAdmin\b/ },
	{ label: 'roles с .includes( или .some(', pattern: /\broles\??\.(?:includes|some)\(/ },
]

const RBAC_SRC = 'packages/rbac/src'
const RBAC_INDEX = 'packages/rbac/src/index.ts'
const ROLE_EXPANSION = /\b(?:buildPermissionSet|expand[A-Z]\w*)\b/

function findChecks(checks, source) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = checks.filter((check) => check.pattern.test(line)).map((check) => check.label)
		if (labels.length > 0) hits.push({ line: index + 1, text: line.trim(), labels })
	})
	return hits
}

function findRoleStringChecks(source) {
	return findChecks(ROLE_STRING_CHECKS, source)
}

function findWebChecks(source) {
	return findChecks(WEB_CHECKS, source)
}

function exportedNames(source) {
	const names = []
	for (const match of source.matchAll(/export\s*(type\s*)?\{([^}]*)\}/g)) {
		if (match[1]) continue
		for (const part of match[2].split(',')) {
			const item = part.trim()
			if (!item || item.startsWith('type ')) continue
			names.push(
				item
					.split(/\s+as\s+/)
					.pop()
					.trim()
			)
		}
	}
	for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) {
		names.push(match[1])
	}
	if (/export\s*\*\s*from/.test(source)) names.push('*')
	return names
}

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

function exceptionFor(file, text) {
	return SERVER_EXCEPTIONS.find((item) => item.file === file && text.includes(item.fragment))
}

const q = '\u0027'

test('детектор находит решения о доступе по строкам ролей и пропускает проверки прав', () => {
	const violating = [
		`const isAdmin = req.authUser!.roles?.includes(${q}admin${q}) ?? false`,
		`const isAdmin = req.authUser!.roles?.some((r) => [${q}admin${q}, ${q}teacher${q}].includes(r)) ?? false`,
		`if (access.roles.includes(${q}admin${q})) return true`,
		`if (roleKeys.includes(${q}user${q})) return true`,
		`if (user.role === ${q}admin${q}) return next()`,
		`if (${q}admin${q} === role) return next()`,
		`if (roleKey !== ${q}user${q}) return res.status(403).end()`,
		'and ${userRoles.roleKey} = ' + `${q}admin${q}`,
	]
	for (const sample of violating) {
		assert.equal(findRoleStringChecks(sample).length, 1, sample)
	}
	const allowed = [
		`const canReadAll = await hasPermission(req, ${q}tests.read${q})`,
		`router.get(${q}/chart-default-range${q}, sessionRequired(), requirePerm(${q}settings${q}, ${q}manage${q}))`,
		`return access.permissions.has(${q}tests.write${q})`,
		`const roles = normaliseRoleKeys(rows.map((row) => row.role))`,
		`if (status === ${q}active${q}) return next()`,
		`await db.insert(roles).values({ key: ${q}admin${q} })`,
	]
	for (const sample of allowed) {
		assert.deepEqual(findRoleStringChecks(sample), [], sample)
	}
})

test('в routes, middleware и services сервера нет решений о доступе по строкам ролей, кроме поимённых исключений', () => {
	const violations = []
	let scanned = 0
	for (const root of SCAN_ROOTS) {
		const files = collectSources(root)
		assert.ok(files.length > 0, `${root}: не найдено ни одного исходника`)
		scanned += files.length
		for (const file of files) {
			const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
			for (const hit of findRoleStringChecks(fs.readFileSync(file, 'utf8'))) {
				if (exceptionFor(relative, hit.text)) continue
				violations.push(`${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
			}
		}
	}
	assert.ok(scanned >= 30, `просканировано файлов: ${scanned}`)
	assert.deepEqual(violations, [], 'доступ решает право через модуль access-policy (requirePerm, hasPermission)')
})

test('каждое исключение существует ровно в заявленном числе и ловится детектором', () => {
	assert.equal(
		SERVER_EXCEPTIONS.reduce((sum, item) => sum + item.count, 0),
		5
	)
	for (const item of SERVER_EXCEPTIONS) {
		const source = fs.readFileSync(path.join(REPO_ROOT, item.file), 'utf8')
		const lines = source.split('\n').filter((line) => line.includes(item.fragment))
		assert.equal(lines.length, item.count, `${item.file}: ${item.fragment}`)
		const detected = findRoleStringChecks(source).filter((hit) => hit.text.includes(item.fragment))
		assert.equal(detected.length, item.count, `${item.file}: детектор не видит ${item.fragment}`)
	}
})

test('детектор web находит pg, jsonwebtoken, чтение секретов и проверки по ролям', () => {
	const violating = [
		`import { Pool } from ${q}pg${q}`,
		`import jwt from "jsonwebtoken"`,
		`import ${q}pg${q}`,
		`const { Pool } = require(${q}pg${q})`,
		`const jwt = await import(${q}jsonwebtoken${q})`,
		`import type { JwtPayload } from ${q}jsonwebtoken/index${q}`,
		'const url = process.env.DATABASE_URL',
		'const secret = process.env.AUTH_JWT_SECRET ?? ""',
		`const url = process.env[${q}DATABASE_URL${q}]`,
		'const secret = process.env["AUTH_JWT_SECRET"]',
		'const { DATABASE_URL, API_ORIGIN } = process.env',
		'const { AUTH_JWT_SECRET: secret } = process.env',
		'if (isAdmin) return children',
		`const isAdmin = me?.roles?.includes(${q}admin${q})`,
		`if (me.roles.includes(${q}admin${q})) return null`,
		`return user?.roles?.includes(${q}admin${q}) ?? false`,
		`const ok = roles.some((r) => r === ${q}admin${q})`,
	]
	for (const sample of violating) {
		assert.ok(findWebChecks(sample).length > 0, sample)
	}
	const allowed = [
		`import { can } from ${q}@bio-exam/rbac${q}`,
		`import { cookies } from ${q}next/headers${q}`,
		`import page from ${q}./page${q}`,
		`import { pgTable } from ${q}drizzle-orm/pg-core${q}`,
		'const raw = process.env.API_ORIGIN',
		'const name = process.env.SESSION_COOKIE_NAME',
		`if (can(perms, ${q}users${q}, ${q}edit${q})) return children`,
		`const canEdit = can(${q}users.edit${q})`,
		'const roleLabels = me.roleLabels.map(String)',
		`const selected = form.roleKeys.includes(${q}user${q})`,
	]
	for (const sample of allowed) {
		assert.deepEqual(findWebChecks(sample), [], sample)
	}
})

test('в app/web нет pg, jsonwebtoken, чтения DATABASE_URL и AUTH_JWT_SECRET и проверок по ролям', () => {
	const files = collectSources(WEB_ROOT)
	assert.ok(files.length >= 100, `${WEB_ROOT}: просканировано файлов: ${files.length}`)
	const violations = []
	for (const file of files) {
		const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
		for (const hit of findWebChecks(fs.readFileSync(file, 'utf8'))) {
			violations.push(`${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
		}
	}
	assert.deepEqual(violations, [], 'web берёт пользователя и права из /api/auth/me Express (ADR-0001)')
})

test('в app/web/package.json нет pg, jsonwebtoken и их типов', () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, WEB_ROOT, 'package.json'), 'utf8'))
	const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }
	for (const name of ['pg', 'jsonwebtoken', '@types/pg', '@types/jsonwebtoken']) {
		assert.ok(!(name in deps), `app/web/package.json: ${name}`)
	}
})

test('детектор экспортов и разворота ролей видит buildPermissionSet и функции expand*', () => {
	assert.deepEqual(exportedNames(`export { buildPermissionSet, can } from ${q}./rbac${q}`), [
		'buildPermissionSet',
		'can',
	])
	assert.deepEqual(exportedNames(`export { build as buildPermissionSet } from ${q}./rbac${q}`), ['buildPermissionSet'])
	assert.deepEqual(exportedNames('export function buildPermissionSet(roles) {}'), ['buildPermissionSet'])
	assert.deepEqual(exportedNames(`export * from ${q}./rbac${q}`), ['*'])
	assert.deepEqual(exportedNames(`export type { RoleKey } from ${q}./roles${q}`), [])
	assert.deepEqual(exportedNames(`export { can, type PermissionKey } from ${q}./rbac${q}`), ['can'])
	for (const sample of [
		'function expandRole(roleKey, seen) {}',
		'const expandGrants = (grants) => new Set()',
		'export function buildPermissionSet(roles) {}',
	]) {
		assert.match(sample, ROLE_EXPANSION, sample)
	}
	for (const sample of ['export function can(perms, key) {}', 'inherits?: RoleKey[]', 'const expanded = true']) {
		assert.doesNotMatch(sample, ROLE_EXPANSION, sample)
	}
})

test('packages/rbac не экспортирует buildPermissionSet и не разворачивает роли в права', () => {
	const exported = exportedNames(fs.readFileSync(path.join(REPO_ROOT, RBAC_INDEX), 'utf8'))
	assert.ok(exported.includes('can'), `${RBAC_INDEX}: нет экспорта can`)
	assert.ok(!exported.includes('*'), `${RBAC_INDEX}: export * скрывает список экспортов`)
	assert.ok(!exported.includes('buildPermissionSet'), `${RBAC_INDEX}: экспортирует buildPermissionSet`)
	const files = collectSources(RBAC_SRC)
	assert.ok(files.length > 0, `${RBAC_SRC}: не найдено ни одного исходника`)
	const violations = []
	for (const file of files) {
		const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
		fs.readFileSync(file, 'utf8')
			.split('\n')
			.forEach((line, index) => {
				if (ROLE_EXPANSION.test(line)) violations.push(`${relative}:${index + 1}: ${line.trim()}`)
			})
	}
	assert.deepEqual(violations, [], 'права считает модуль access-policy сервера, пакет rbac — словарь (D-01)')
})
