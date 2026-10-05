import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const SCOPES = {
	routes: { root: 'app/server/src/routes', tests: false, minFiles: 15 },
	routesTests: { root: 'app/server/src/routes/tests', tests: false, minFiles: 3 },
	web: { root: 'app/web', tests: false, minFiles: 100 },
	server: { root: 'app/server/src', tests: true, minFiles: 100 },
}

const QUOTE = String.raw`['"\x60]`

const RULES = [
	{
		label: 'импорт fs, node:fs или fs/promises в маршруте',
		scope: 'routes',
		pattern: new RegExp(
			String.raw`(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)${QUOTE}(?:node:)?fs(?:\/promises)?${QUOTE}`
		),
	},
	{ label: 'вызов process.cwd() в маршруте', scope: 'routes', pattern: /\bprocess\.cwd\s*\(/ },
	{ label: 'getQuestionPath или getTestPath в маршруте', scope: 'routes', pattern: /\bget(?:Question|Test)Path\b/ },
	{
		label: 'литерал ключа хранилища topics/ или avatars/ в маршруте',
		scope: 'routes',
		pattern: new RegExp(String.raw`${QUOTE}(?:topics|avatars)\/`),
	},
	{ label: 'путь web/public/uploads в маршруте', scope: 'routes', pattern: /web\/public\/uploads/ },
	{
		label: 'импорт services/storage в routes/tests',
		scope: 'routesTests',
		pattern: new RegExp(String.raw`${QUOTE}[^'"\x60]*services\/storage(?:\/[^'"\x60]*)?${QUOTE}`),
	},
	{ label: 'адрес /storage/v1/ в web', scope: 'web', pattern: /\/storage\/v1\// },
	{
		label: 'getStoragePathFromSupabaseUrl или isStoragePath в web',
		scope: 'web',
		pattern: /\b(?:getStoragePathFromSupabaseUrl|isStoragePath)\b/,
	},
	{ label: 'assertLegacyUploadsAllowed в сервере', scope: 'server', pattern: /\bassertLegacyUploadsAllowed\b/ },
]

const EXCEPTIONS = []

const ROLES_FILE = 'packages/rbac/src/roles.ts'
const TESTS_ROUTER = 'app/server/src/routes/tests/index.ts'
const TESTS_ADMIN_ROUTERS = 'app/server/src/routes/tests/admin'

const SCOPED_ROUTES = [
	['get', '/by-slug/:topicSlug/:testSlug'],
	['get', '/:id'],
	['post', '/save'],
	['patch', '/:id/settings'],
	['patch', '/topics/:id'],
	['delete', '/topics/:id'],
	['post', '/:id/questions'],
	['patch', '/:id/questions/:questionId'],
	['delete', '/:id/questions/:questionId'],
	['put', '/:id/questions/reorder'],
	['post', '/:id/questions/:questionId/move'],
	['delete', '/:id'],
	['post', '/:id/assets'],
	['get', '/:id/export'],
	['get', '/topics/:slug/export'],
]

const SCOPE_FUNCTIONS = ['canReadTest', 'canWriteTest', 'canWriteTopic', 'testScope']

function rulesFor(scope) {
	return RULES.filter((rule) => rule.scope === scope)
}

function findViolations(rules, source) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = rules.filter((rule) => rule.pattern.test(line)).map((rule) => rule.label)
		if (labels.length > 0) hits.push({ line: index + 1, text: line.trim(), labels })
	})
	return hits
}

function matchingBrace(source, open) {
	let depth = 0
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++
		else if (source[i] === '}') {
			depth--
			if (depth === 0) return i
		}
	}
	return -1
}

function objectBody(source, keyPattern) {
	const match = keyPattern.exec(source)
	if (!match) return null
	const open = match.index + match[0].length - 1
	const close = matchingBrace(source, open)
	if (close < 0) return null
	return source.slice(open + 1, close)
}

function userRoleGrants(source) {
	const role = objectBody(source, /(?:^|[\s{,])user\s*:\s*\{/)
	if (role === null) return null
	return objectBody(role, /\bgrants\s*:\s*\{/)
}

function userRoleGrantsUsers(source) {
	const grants = userRoleGrants(source)
	if (grants === null) return null
	return /(?:^|[\s{,'"])users['"]?\s*:/.test(grants)
}

function registrations(source) {
	const found = []
	for (const part of `\n${source}`.split('\nrouter.').slice(1)) {
		const head = part.includes('async') ? part.slice(0, part.indexOf('async')) : part
		const match = /^(get|post|patch|put|delete)\(\s*(['"\x60])([^'"\x60]*)\2/.exec(head)
		if (match) found.push({ method: match[1], path: match[3], head })
	}
	return found
}

function scopeGateViolations(source) {
	const found = registrations(source)
	const problems = []
	for (const [method, routePath] of SCOPED_ROUTES) {
		const matches = found.filter((item) => item.method === method && item.path === routePath)
		if (matches.length === 0) {
			problems.push(`${method.toUpperCase()} ${routePath}: регистрация не найдена`)
			continue
		}
		for (const item of matches) {
			if (item.head.includes('requirePerm(')) problems.push(`${method.toUpperCase()} ${routePath}: requirePerm(`)
		}
	}
	for (const name of SCOPE_FUNCTIONS) {
		if (!new RegExp(String.raw`\b${name}\(`).test(source)) problems.push(`нет вызова ${name}(`)
	}
	return problems
}

function collectSources(relativeDir, includeTests) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue
			if (!includeTests && TEST_FILE.test(entry.name)) continue
			files.push(path.join(dir, entry.name))
		}
	}
	walk(path.join(REPO_ROOT, relativeDir))
	return files.sort()
}

function testsRouterSource() {
	const admin = collectSources(TESTS_ADMIN_ROUTERS, false)
	assert.ok(admin.length > 0, `${TESTS_ADMIN_ROUTERS}: нет файлов суброутеров`)
	return [path.join(REPO_ROOT, TESTS_ROUTER), ...admin].map((file) => fs.readFileSync(file, 'utf8')).join('\n')
}

function relativePath(file) {
	return path.relative(REPO_ROOT, file).split(path.sep).join('/')
}

function exceptionFor(file, text) {
	return EXCEPTIONS.find((item) => item.file === file && text.includes(item.fragment))
}

const q = '\u0027'

const VIOLATING = [
	{ rule: 'импорт fs, node:fs или fs/promises в маршруте', text: `import fs from ${q}fs${q}` },
	{ rule: 'импорт fs, node:fs или fs/promises в маршруте', text: `import { readFile } from ${q}node:fs/promises${q}` },
	{ rule: 'импорт fs, node:fs или fs/promises в маршруте', text: `const fs = require(${q}node:fs${q})` },
	{ rule: 'вызов process.cwd() в маршруте', text: 'const root = process.cwd()' },
	{
		rule: 'путь web/public/uploads в маршруте',
		text: `const dir = path.join(process.cwd(), ${q}../web/public/uploads${q})`,
	},
	{
		rule: 'вызов process.cwd() в маршруте',
		text: `const dir = path.join(process.cwd(), ${q}../web/public/uploads${q})`,
	},
	{ rule: 'литерал ключа хранилища topics/ или avatars/ в маршруте', text: `const key = ${q}topics/${q} + slug` },
	{ rule: 'литерал ключа хранилища topics/ или avatars/ в маршруте', text: 'const key = `avatars/${id}`' },
	{ rule: 'getQuestionPath или getTestPath в маршруте', text: 'const dir = storageService.getQuestionPath(t, s, id)' },
	{ rule: 'getQuestionPath или getTestPath в маршруте', text: 'const dir = getTestPath(t, s)' },
	{
		rule: 'импорт services/storage в routes/tests',
		text: `import { storage } from ${q}../../services/storage/index.js${q}`,
	},
	{ rule: 'адрес /storage/v1/ в web', text: `const marker = ${q}/storage/v1/object${q}` },
	{ rule: 'getStoragePathFromSupabaseUrl или isStoragePath в web', text: 'if (isStoragePath(src)) return src' },
	{
		rule: 'getStoragePathFromSupabaseUrl или isStoragePath в web',
		text: 'const key = getStoragePathFromSupabaseUrl(url)',
	},
	{ rule: 'assertLegacyUploadsAllowed в сервере', text: 'assertLegacyUploadsAllowed()' },
]

const ALLOWED = [
	{
		scope: 'routes',
		text: `router.patch(${q}/topics/:id${q}, validateUUID(${q}id${q}), sessionRequired(), async () => {})`,
	},
	{ scope: 'routes', text: `router.get(${q}/topics/:slug/export${q}, sessionRequired(), async () => {})` },
	{ scope: 'routes', text: `const proxy = ${q}/api/docs/assets/proxy${q}` },
	{ scope: 'routes', text: `import { readQuestion } from ${q}../../services/question-content/index.js${q}` },
	{ scope: 'routes', text: `import path from ${q}node:path${q}` },
	{ scope: 'routes', text: `const name = ${q}fs-name${q}` },
	{ scope: 'routesTests', text: `import { canWriteTest } from ${q}../../services/access-policy/index.js${q}` },
	{ scope: 'routesTests', text: `import { uploadImage } from ${q}../../services/assets/index.js${q}` },
	{ scope: 'web', text: `const src = ${q}/api/docs/assets/proxy?key=${q} + key` },
	{ scope: 'web', text: 'const url = storageUrl(key)' },
	{ scope: 'server', text: 'assertStorageConfigured()' },
]

test('каждое правило срабатывает на своём нарушающем образце', () => {
	for (const rule of RULES) {
		assert.ok(
			VIOLATING.some((sample) => sample.rule === rule.label),
			`нет нарушающего образца для правила: ${rule.label}`
		)
	}
	for (const sample of VIOLATING) {
		const rule = RULES.find((item) => item.label === sample.rule)
		assert.ok(rule, `неизвестное правило в образце: ${sample.rule}`)
		const hits = findViolations(rulesFor(rule.scope), sample.text)
		assert.equal(hits.length, 1, sample.text)
		assert.ok(hits[0].labels.includes(sample.rule), `${sample.text}: ${hits[0].labels.join(', ')}`)
	}
})

test('правила не срабатывают на допустимых образцах', () => {
	for (const sample of ALLOWED) {
		assert.deepEqual(findViolations(rulesFor(sample.scope), sample.text), [], sample.text)
	}
})

test('разбор роли user видит выдачу users и пропускает пустые гранты', () => {
	const violating = [
		`user: { key: ${q}user${q}, name: ${q}Пользователь${q}, grants: { users: [${q}read${q}] }, order: 10 }`,
		`\tuser: {\n\t\tkey: ${q}user${q},\n\t\tgrants: { tests: [${q}read${q}], users: [${q}*${q}] },\n\t},`,
	]
	for (const sample of violating) assert.equal(userRoleGrantsUsers(sample), true, sample)
	const allowed = [
		`user: { key: ${q}user${q}, name: ${q}Пользователь${q}, grants: {}, order: 10 }`,
		`admin: { grants: { users: [${q}*${q}] } },\n\tuser: { key: ${q}user${q}, grants: { tests: [${q}read${q}] } },`,
	]
	for (const sample of allowed) assert.equal(userRoleGrantsUsers(sample), false, sample)
	assert.equal(userRoleGrantsUsers(`admin: { grants: {} }`), null)
})

test('разбор регистраций маршрутов видит requirePerm и пропускает проверку через функции зоны', () => {
	const violating = `router.patch(${q}/:id/settings${q}, sessionRequired(), requirePerm(${q}tests${q}, ${q}write${q}), async (req, res) => {})`
	const parsed = registrations(violating)
	assert.equal(parsed.length, 1)
	assert.equal(parsed[0].method, 'patch')
	assert.equal(parsed[0].path, '/:id/settings')
	assert.ok(parsed[0].head.includes('requirePerm('))
	assert.ok(
		scopeGateViolations(violating).includes('PATCH /:id/settings: requirePerm('),
		scopeGateViolations(violating).join('\n')
	)
	const allowed = `router.patch(\n\t${q}/topics/:id${q},\n\tvalidateUUID(${q}id${q}),\n\tsessionRequired(),\n\tasync (req, res) => {\n\t\tif (!(await canWriteTopic(req, id))) return res.status(403).end()\n\t\trequirePerm(${q}x${q})\n\t}\n)`
	const allowedParsed = registrations(allowed)
	assert.equal(allowedParsed.length, 1)
	assert.equal(allowedParsed[0].path, '/topics/:id')
	assert.ok(!allowedParsed[0].head.includes('requirePerm('))
	assert.ok(scopeGateViolations('').includes(`GET /:id: регистрация не найдена`))
	assert.ok(scopeGateViolations('').includes('нет вызова testScope('))
})

test('маршруты, routes/tests, web и сервер не нарушают правила хранилища, кроме поимённых исключений', () => {
	const violations = []
	for (const [scope, config] of Object.entries(SCOPES)) {
		const files = collectSources(config.root, config.tests)
		assert.ok(files.length >= config.minFiles, `${config.root}: просканировано файлов: ${files.length}`)
		const rules = rulesFor(scope)
		for (const file of files) {
			const relative = relativePath(file)
			for (const hit of findViolations(rules, fs.readFileSync(file, 'utf8'))) {
				if (exceptionFor(relative, hit.text)) continue
				violations.push(`${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
			}
		}
	}
	assert.deepEqual(
		violations,
		[],
		'файлы идут через services/storage и services/question-content, web не разбирает URL хранилища (D-25)'
	)
})

test('каждое исключение существует ровно в заявленном числе и ловится детектором', () => {
	assert.equal(
		EXCEPTIONS.reduce((sum, item) => sum + item.count, 0),
		0
	)
	for (const item of EXCEPTIONS) {
		assert.ok(item.reason, `${item.file}: нет причины исключения`)
		const source = fs.readFileSync(path.join(REPO_ROOT, item.file), 'utf8')
		const lines = source.split('\n').filter((line) => line.includes(item.fragment))
		assert.equal(lines.length, item.count, `${item.file}: ${item.fragment}`)
		const detected = findViolations(RULES, source).filter((hit) => hit.text.includes(item.fragment))
		assert.equal(detected.length, item.count, `${item.file}: детектор не видит ${item.fragment}`)
	}
})

test('роль user в packages/rbac не выдаёт users (PRIV-01)', () => {
	const source = fs.readFileSync(path.join(REPO_ROOT, ROLES_FILE), 'utf8')
	assert.notEqual(userRoleGrants(source), null, `${ROLES_FILE}: блок user или его grants не найден`)
	assert.equal(userRoleGrantsUsers(source), false, `${ROLES_FILE}: роль user выдаёт users`)
})

test('объектные маршруты routes/tests проверяют доступ функциями зоны, а не requirePerm', () => {
	const source = testsRouterSource()
	assert.ok(
		registrations(source).length >= SCOPED_ROUTES.length,
		`${TESTS_ROUTER} и ${TESTS_ADMIN_ROUTERS}: мало регистраций`
	)
	assert.deepEqual(scopeGateViolations(source), [], 'доступ к тесту и теме решает services/access-policy/scope.ts')
})
