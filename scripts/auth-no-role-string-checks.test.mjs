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

function findRoleStringChecks(source) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = ROLE_STRING_CHECKS.filter((check) => check.pattern.test(line)).map((check) => check.label)
		if (labels.length > 0) hits.push({ line: index + 1, text: line.trim(), labels })
	})
	return hits
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
