import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const INVENTORY = 'app/server/route-inventory.txt'
const CALLER_ROOTS = [
	{ root: 'app/web', skipTests: true },
	{ root: 'e2e', skipTests: false },
]
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage', 'test-results'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/
const ROUTE_LINE = /^(GET|POST|PUT|PATCH|DELETE) (\/api\/\S*)/

const KNOWN_UNCALLED = new Map([
	['GET /api/tests/scoring-rules/global', 'удаляется в фазе 11.1 (docs/adr/0008-question-type-catalog-module.md)'],
	['PUT /api/tests/scoring-rules/global', 'удаляется в фазе 11.1 (docs/adr/0008-question-type-catalog-module.md)'],
	['GET /api/tests/scoring-rules/tests/:id', 'удаляется в фазе 11.1 (docs/adr/0008-question-type-catalog-module.md)'],
	['PUT /api/tests/scoring-rules/tests/:id', 'удаляется в фазе 11.1 (docs/adr/0008-question-type-catalog-module.md)'],
	['GET /api/rbac/pages', 'вызовов из web нет; решение «удалить или оставить» не принято'],
	['POST /api/rbac/pages', 'вызовов из web нет; решение «удалить или оставить» не принято'],
	['PATCH /api/rbac/pages/:id', 'вызовов из web нет; решение «удалить или оставить» не принято'],
	['DELETE /api/rbac/pages/:id', 'вызовов из web нет; решение «удалить или оставить» не принято'],
	['POST /api/notifications/:id/read', 'web отмечает прочитанным через read-all и open; решение не принято'],
	[
		'POST /api/tests/:testId/assignments/group/:groupId',
		'вызовов из web нет; решение «удалить или оставить» не принято',
	],
])

function sourceFiles(dir, skipTests, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRS.has(entry.name)) sourceFiles(path.join(dir, entry.name), skipTests, out)
			continue
		}
		if (SOURCE_FILE.test(entry.name) && !(skipTests && TEST_FILE.test(entry.name))) out.push(path.join(dir, entry.name))
	}
	return out
}

function apiRoutes() {
	const text = fs.readFileSync(path.join(REPO_ROOT, INVENTORY), 'utf8')
	const routes = new Set()
	for (const line of text.split('\n')) {
		const match = ROUTE_LINE.exec(line)
		if (match) routes.add(`${match[1]} ${match[2]}`)
	}
	return [...routes]
}

function segmentPatterns(route) {
	const routePath = route.split(' ')[1]
	return routePath
		.replace(/^\/api/, '')
		.split('/')
		.filter((segment) => segment && !segment.startsWith(':'))
		.map((segment) => new RegExp(`/${segment.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?![\\w-])`))
}

const callerTexts = CALLER_ROOTS.flatMap(({ root, skipTests }) =>
	sourceFiles(path.join(REPO_ROOT, root), skipTests)
).map((file) => fs.readFileSync(file, 'utf8'))

function hasCaller(route) {
	const patterns = segmentPatterns(route)
	return callerTexts.some((text) => patterns.every((pattern) => pattern.test(text)))
}

test('каждый маршрут /api из инвентаря вызывается из web или e2e либо записан в KNOWN_UNCALLED с причиной', () => {
	const routes = apiRoutes()
	assert.ok(routes.length > 50, `в ${INVENTORY} найдено только ${routes.length} маршрутов /api`)
	const uncalled = routes.filter((route) => !hasCaller(route) && !KNOWN_UNCALLED.has(route))
	assert.deepEqual(
		uncalled,
		[],
		'маршрут без вызовов: удалите его или добавьте в KNOWN_UNCALLED с причиной (все статические сегменты пути ищутся в одном файле app/web без юнит-тестов или e2e)'
	)
})

test('записи KNOWN_UNCALLED соответствуют существующим маршрутам без вызовов', () => {
	const routes = new Set(apiRoutes())
	const stale = [...KNOWN_UNCALLED.keys()].filter((route) => !routes.has(route) || hasCaller(route))
	assert.deepEqual(stale, [], 'маршрут удалён или у него появился вызов: уберите запись из KNOWN_UNCALLED')
})
