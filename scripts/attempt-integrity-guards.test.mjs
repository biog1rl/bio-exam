import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const WEB_ROOT = 'app/web'
const WEB_TESTS_DIRS = ['app/web/components/tests', 'app/web/lib/tests']
const TEST_RUNNER = 'app/web/components/tests/TestRunner.tsx'
const SERVER_ROOT = 'app/server/src'
const SERVER_ROUTES = 'app/server/src/routes'
const PUBLIC_ROUTES = 'app/server/src/routes/tests/public.ts'
const ADMIN_ATTEMPT_ROUTES = 'app/server/src/routes/tests/admin/attempts.ts'
const ACCESS_POLICY_DIR = 'app/server/src/services/access-policy/'
const SEARCH_ROUTE = 'app/server/src/routes/search.ts'
const SEARCH_DIR = 'app/server/src/services/search/'
const SCORED_ATTEMPT_DIR = 'app/server/src/services/scored-attempt/'
const ASSIGNMENT_ROUTES = new Set([
	'app/server/src/routes/tests/assignments.ts',
	'app/server/src/routes/users/index.ts',
])
const ADMIN_REVIEW_ROUTE = "'/admin/attempts/:attemptId'"

const WEB_CHECKS = [
	{
		label: 'вызов computeVerdicts(: вердикты приходят в виде попытки с сервера',
		match: (line) => line.includes('computeVerdicts('),
	},
	{
		label: 'функция getQuestionStatus: статус вопроса берётся из вида',
		match: (line) => /\bgetQuestionStatus\b/.test(line),
	},
	{
		label: 'results: unknown[]: результат разбирается схемой вида',
		match: (line) => line.includes('results: unknown[]'),
	},
]

const KEY_VISIBILITY_FRAGMENTS = [
	'correctAnswer != null ||',
	'isCorrect ? studentAnswer',
	'showCorrectAnswer={',
	'showCorrectAnswer ?',
	'showCorrectAnswer &&',
]

const KEY_VISIBILITY_CHECKS = KEY_VISIBILITY_FRAGMENTS.map((fragment) => ({
	label: `догадка о видимости ключа «${fragment}»: видимость ключа решает сервер`,
	match: (line) => line.includes(fragment),
}))

const RUNNER_STATUS_CHECKS = [
	{
		label: 'тернарный выбор по earnedPoints > 0: статус карточки берётся из вида',
		match: (line) => /earnedPoints\s*>\s*0\s*\?/.test(line),
	},
]

const TESTS_READ_CHECKS = [
	{
		label: "hasPermission(req, 'tests.read') вне access-policy: доступ к тесту через canReadTest и testScope",
		match: (line) =>
			line.includes("hasPermission(req, 'tests.read')") || line.includes('hasPermission(req, "tests.read")'),
	},
]

const SEARCH_CHECKS = [
	{
		label: 'isPrivileged в services/search: привилегию поиска решает шов через testScope, groupScope и userScope',
		match: (line) => /\bisPrivileged\b/.test(line),
	},
	{
		label: "permissions.has('tests.read') в services/search: чтение тестов выражено через testScope",
		match: (line) => line.includes("permissions.has('tests.read')") || line.includes('permissions.has("tests.read")'),
	},
]

const REQUIRED_SCOPE_CALLS = [
	{
		file: PUBLIC_ROUTES,
		calls: ['canReadTest(', 'testScope('],
		label: 'маршруты попытки не вызывают',
	},
	{
		file: SEARCH_ROUTE,
		calls: ['testScope(', 'groupScope(', 'userScope('],
		label: 'маршрут поиска не вызывает',
	},
]

const RESULTS_READ_CHECKS = [
	{
		label: 'чтение testAttempts.results вне services/scored-attempt',
		match: (line) => /\btestAttempts\.results\b/.test(line),
	},
]

const ASSIGNMENT_QUERY_CHECKS = [
	{
		label: '.from(testAssignments) вне управления назначениями: назначение проверяет canReadTest',
		match: (line) => /\.from\(\s*testAssignments\b/.test(line),
	},
]

const PUBLIC_ROUTES_CHECKS = [
	{
		label: 'answerKeys в маршрутах попытки: разбор строит services/scored-attempt',
		match: (line) => /\banswerKeys\b/.test(line),
	},
	{
		label: 'testAssignments в маршрутах попытки: назначение проверяет canReadTest',
		match: (line) => /\btestAssignments\b/.test(line),
	},
]

function toRelative(root, file) {
	return path.relative(root, file).split(path.sep).join('/')
}

function collectSources(root, relativeDir) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(toRelative(root, path.join(dir, entry.name)))
		}
	}
	const start = path.join(root, relativeDir)
	if (fs.existsSync(start)) walk(start)
	return files.sort()
}

function findLines(checks, source, lineOffset = 0) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = checks.filter((check) => check.match(line)).map((check) => check.label)
		if (labels.length > 0) hits.push({ line: index + 1 + lineOffset, text: line.trim(), labels })
	})
	return hits
}

function formatHits(relative, hits) {
	return hits.map((hit) => `${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
}

function scanFiles(root, files, checks) {
	const violations = []
	for (const relative of files) {
		violations.push(...formatHits(relative, findLines(checks, fs.readFileSync(path.join(root, relative), 'utf8'))))
	}
	return violations
}

function webViolations(root) {
	return scanFiles(root, collectSources(root, WEB_ROOT), WEB_CHECKS)
}

function keyVisibilityViolations(root) {
	return scanFiles(
		root,
		WEB_TESTS_DIRS.flatMap((dir) => collectSources(root, dir)),
		KEY_VISIBILITY_CHECKS
	)
}

function runnerStatusViolations(root) {
	return scanFiles(root, [TEST_RUNNER], RUNNER_STATUS_CHECKS)
}

function testsReadViolations(root) {
	const files = collectSources(root, SERVER_ROOT).filter((file) => !file.startsWith(ACCESS_POLICY_DIR))
	return scanFiles(root, files, TESTS_READ_CHECKS)
}

function searchViolations(root) {
	return scanFiles(root, collectSources(root, SEARCH_DIR), SEARCH_CHECKS)
}

function resultsReadViolations(root) {
	const files = collectSources(root, SERVER_ROOT).filter((file) => !file.startsWith(SCORED_ATTEMPT_DIR))
	return scanFiles(root, files, RESULTS_READ_CHECKS)
}

function assignmentQueryViolations(root) {
	const files = collectSources(root, SERVER_ROUTES).filter((file) => !ASSIGNMENT_ROUTES.has(file))
	return scanFiles(root, files, ASSIGNMENT_QUERY_CHECKS)
}

function publicRoutesViolations(root) {
	return scanFiles(root, [PUBLIC_ROUTES], PUBLIC_ROUTES_CHECKS)
}

function adminReviewHandler(source) {
	const start = source.indexOf(ADMIN_REVIEW_ROUTE)
	if (start === -1) return null
	const rest = source.slice(start)
	const next = rest.indexOf('\nrouter.')
	const body = next === -1 ? rest : rest.slice(0, next)
	return { body, lineOffset: source.slice(0, start).split('\n').length - 1 }
}

function adminReviewViolations(root) {
	const source = fs.readFileSync(path.join(root, ADMIN_ATTEMPT_ROUTES), 'utf8')
	const handler = adminReviewHandler(source)
	if (!handler) return [`${ADMIN_ATTEMPT_ROUTES}: нет обработчика ${ADMIN_REVIEW_ROUTE}`]
	const violations = formatHits(
		ADMIN_ATTEMPT_ROUTES,
		findLines(
			[
				{
					label: 'answerKeys в обработчике разбора: разбор строит services/scored-attempt',
					match: (line) => /\banswerKeys\b/.test(line),
				},
			],
			handler.body,
			handler.lineOffset
		)
	)
	if (!handler.body.includes('canReviewAttempt(')) {
		violations.push(`${ADMIN_ATTEMPT_ROUTES}: обработчик ${ADMIN_REVIEW_ROUTE} не вызывает canReviewAttempt(`)
	}
	return violations
}

function requiredScopeCallsViolations(root, entries = REQUIRED_SCOPE_CALLS) {
	return entries.flatMap(({ file, calls, label }) => {
		const source = fs.readFileSync(path.join(root, file), 'utf8')
		return calls
			.filter((call) => !source.includes(call))
			.map((call) => `${file}: ${label} ${call} из services/access-policy/scope.ts`)
	})
}

const q = '\u0027'

function matchesAny(checks, sample) {
	return findLines(checks, sample).length > 0
}

test('детекторы находят запрещённые строки и пропускают разрешённые', () => {
	for (const sample of [
		'const verdicts = computeVerdicts({ question, answer })',
		'function getQuestionStatus(item) {}',
		'const getQuestionStatus = (item) => item.status',
		'type Attempt = { results: unknown[] }',
	]) {
		assert.ok(matchesAny(WEB_CHECKS, sample), sample)
	}
	for (const sample of [
		`import { computeVerdicts } from ${q}@bio-exam/exam-core${q}`,
		'const status = view.status',
		'results: AttemptQuestionView[]',
	]) {
		assert.ok(!matchesAny(WEB_CHECKS, sample), sample)
	}
	for (const sample of [
		'const visible = correctAnswer != null || showKey',
		'const shown = isCorrect ? studentAnswer : correct',
		'<AnswerReview showCorrectAnswer={test.showCorrectAnswer} />',
		'const key = showCorrectAnswer ? view.key : null',
		'{showCorrectAnswer && <Key />}',
	]) {
		assert.ok(matchesAny(KEY_VISIBILITY_CHECKS, sample), sample)
	}
	assert.ok(!matchesAny(KEY_VISIBILITY_CHECKS, 'const key = view.correctAnswer ?? null'))
	assert.ok(matchesAny(RUNNER_STATUS_CHECKS, `const tone = item.earnedPoints > 0 ? ${q}ok${q} : ${q}bad${q}`))
	assert.ok(!matchesAny(RUNNER_STATUS_CHECKS, 'const tone = toneFor(view.status)'))
	assert.ok(matchesAny(TESTS_READ_CHECKS, `const canReadAll = await hasPermission(req, ${q}tests.read${q})`))
	assert.ok(!matchesAny(TESTS_READ_CHECKS, 'const allowed = await canReadTest(req, testId)'))
	assert.ok(matchesAny(SEARCH_CHECKS, 'const privileged = isPrivileged(access)'))
	assert.ok(matchesAny(SEARCH_CHECKS, `if (access.permissions.has(${q}tests.read${q})) return true`))
	assert.ok(!matchesAny(SEARCH_CHECKS, `if (access.permissions.has(${q}tests.write${q})) return true`))
	assert.ok(!matchesAny(SEARCH_CHECKS, 'const staff = hasTestZone(access.tests)'))
	assert.ok(matchesAny(RESULTS_READ_CHECKS, 'select({ results: testAttempts.results })'))
	assert.ok(!matchesAny(RESULTS_READ_CHECKS, 'select({ version: testAttempts.resultsVersion })'))
	assert.ok(matchesAny(ASSIGNMENT_QUERY_CHECKS, 'const rows = await db.select().from(testAssignments)'))
	assert.ok(!matchesAny(ASSIGNMENT_QUERY_CHECKS, 'const rows = await db.select().from(testAttempts)'))
	const source = [
		"import { answerKeys } from '../../db/schema.js'",
		"router.get('/other', handler)",
		`router.get(${ADMIN_REVIEW_ROUTE}, async (req, res) => {`,
		'\tif (!(await canReviewAttempt(req, attemptId))) return',
		'})',
		"router.get('/next', () => answerKeys)",
	].join('\n')
	const handler = adminReviewHandler(source)
	assert.equal(handler.lineOffset, 2)
	assert.ok(handler.body.includes('canReviewAttempt('))
	assert.ok(!handler.body.includes('answerKeys'))
})

test('в app/web нет computeVerdicts(, функции getQuestionStatus и results: unknown[]', () => {
	const files = collectSources(REPO_ROOT, WEB_ROOT)
	assert.ok(files.length >= 100, `${WEB_ROOT}: просканировано файлов: ${files.length}`)
	assert.deepEqual(webViolations(REPO_ROOT), [])
})

test('в components/tests и lib/tests web нет догадок о видимости ключа', () => {
	const files = WEB_TESTS_DIRS.flatMap((dir) => collectSources(REPO_ROOT, dir))
	assert.ok(files.length >= 10, `просканировано файлов: ${files.length}`)
	assert.deepEqual(keyVisibilityViolations(REPO_ROOT), [])
})

test('TestRunner не выбирает статус карточки по earnedPoints > 0', () => {
	assert.deepEqual(runnerStatusViolations(REPO_ROOT), [])
})

test('в app/server/src testAttempts.results читается только в services/scored-attempt', () => {
	const files = collectSources(REPO_ROOT, SERVER_ROOT)
	assert.ok(files.length >= 50, `${SERVER_ROOT}: просканировано файлов: ${files.length}`)
	assert.ok(
		collectSources(REPO_ROOT, SCORED_ATTEMPT_DIR).some((file) =>
			/\btestAttempts\.results\b/.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
		),
		`${SCORED_ATTEMPT_DIR}: нет чтения testAttempts.results`
	)
	assert.deepEqual(resultsReadViolations(REPO_ROOT), [])
})

test('маршруты попытки не читают answer_keys и назначения напрямую', () => {
	assert.deepEqual(publicRoutesViolations(REPO_ROOT), [])
})

test('обработчик /admin/attempts/:attemptId без answerKeys и с canReviewAttempt', () => {
	assert.deepEqual(adminReviewViolations(REPO_ROOT), [])
})

test('.from(testAssignments) в routes только в управлении назначениями', () => {
	const files = collectSources(REPO_ROOT, SERVER_ROUTES)
	assert.ok(files.length >= 10, `${SERVER_ROUTES}: просканировано файлов: ${files.length}`)
	for (const file of ASSIGNMENT_ROUTES) {
		assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), file)
	}
	assert.deepEqual(assignmentQueryViolations(REPO_ROOT), [])
})

test("в app/server/src вне access-policy нет hasPermission(req, 'tests.read')", () => {
	const files = collectSources(REPO_ROOT, SERVER_ROOT).filter((file) => !file.startsWith(ACCESS_POLICY_DIR))
	assert.ok(files.length >= 50, `${SERVER_ROOT}: просканировано файлов: ${files.length}`)
	assert.deepEqual(testsReadViolations(REPO_ROOT), [])
})

test('в app/server/src/services/search нет isPrivileged и permissions.has(tests.read)', () => {
	const files = collectSources(REPO_ROOT, SEARCH_DIR)
	assert.ok(files.includes(`${SEARCH_DIR}database-search.ts`), `${SEARCH_DIR}: просканировано файлов: ${files.length}`)
	assert.deepEqual(searchViolations(REPO_ROOT), [])
})

test('маршрут поиска берёт зону из шва: testScope, groupScope и userScope из services/access-policy', () => {
	const source = fs.readFileSync(path.join(REPO_ROOT, SEARCH_ROUTE), 'utf8')
	assert.match(
		source,
		/\{[^}]*\bgroupScope\b[^}]*\}\s*from\s+['"][./]*services\/access-policy\/(?:index|scope)\.js['"]/
	)
	assert.match(source, /\{[^}]*\btestScope\b[^}]*\}\s*from\s+['"][./]*services\/access-policy\/(?:index|scope)\.js['"]/)
	assert.match(source, /\{[^}]*\buserScope\b[^}]*\}\s*from\s+['"][./]*services\/access-policy\/(?:index|scope)\.js['"]/)
	const policyIndex = fs.readFileSync(path.join(REPO_ROOT, ACCESS_POLICY_DIR, 'index.ts'), 'utf8')
	assert.match(policyIndex, /\bgroupScope\b[^}]*\btestScope\b[^}]*\buserScope\b[^}]*\}\s*from\s+['"]\.\/scope\.js['"]/)
	assert.deepEqual(
		requiredScopeCallsViolations(
			REPO_ROOT,
			REQUIRED_SCOPE_CALLS.filter((entry) => entry.file === SEARCH_ROUTE)
		),
		[]
	)
})

test('маршруты попытки вызывают canReadTest и testScope из services/access-policy/scope.ts', () => {
	const source = fs.readFileSync(path.join(REPO_ROOT, PUBLIC_ROUTES), 'utf8')
	assert.match(
		source,
		/\bcanReadTest\b[^}]*\btestScope\b[^}]*\}\s*from\s+['"][./]*services\/access-policy\/(?:index|scope)\.js['"]/
	)
	const policyIndex = fs.readFileSync(path.join(REPO_ROOT, ACCESS_POLICY_DIR, 'index.ts'), 'utf8')
	assert.match(policyIndex, /\bcanReadTest\b[^}]*\btestScope\b[^}]*\}\s*from\s+['"]\.\/scope\.js['"]/)
	assert.deepEqual(requiredScopeCallsViolations(REPO_ROOT), [])
})

test('проба: вставка запрещённой строки в копию файла во временном каталоге даёт нарушение с путём файла', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-guards-'))
	try {
		const copyWith = (relative, line) => {
			const target = path.join(tmp, relative)
			fs.mkdirSync(path.dirname(target), { recursive: true })
			fs.writeFileSync(target, `${fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8')}\n${line}\n`)
		}
		copyWith(TEST_RUNNER, 'const probeVerdicts = computeVerdicts({})')
		copyWith(PUBLIC_ROUTES, `const probeAccess = await hasPermission(req, ${q}tests.read${q})`)
		copyWith(ADMIN_ATTEMPT_ROUTES, 'const probeKeys = answerKeys')
		copyWith(`${SEARCH_DIR}database-search.ts`, 'const privileged = isPrivileged(access)')
		const searchRoute = path.join(tmp, SEARCH_ROUTE)
		fs.mkdirSync(path.dirname(searchRoute), { recursive: true })
		fs.writeFileSync(
			searchRoute,
			fs.readFileSync(path.join(REPO_ROOT, SEARCH_ROUTE), 'utf8').replaceAll('testScope(', 'probeScope(')
		)

		const web = webViolations(tmp)
		assert.equal(web.length, 1, web.join('\n'))
		assert.match(web[0], /^app\/web\/components\/tests\/TestRunner\.tsx:\d+: .*computeVerdicts\(/)

		const server = testsReadViolations(tmp)
		assert.equal(server.length, 1, server.join('\n'))
		assert.match(server[0], /^app\/server\/src\/routes\/tests\/public\.ts:\d+: .*hasPermission\(req, 'tests\.read'\)/)

		const review = adminReviewViolations(tmp)
		assert.equal(review.length, 1, review.join('\n'))
		assert.match(review[0], /^app\/server\/src\/routes\/tests\/admin\/attempts\.ts:\d+: .*answerKeys/)

		const search = searchViolations(tmp)
		assert.equal(search.length, 1, search.join('\n'))
		assert.match(search[0], /^app\/server\/src\/services\/search\/database-search\.ts:\d+: .*isPrivileged/)

		const calls = requiredScopeCallsViolations(tmp)
		assert.equal(calls.length, 1, calls.join('\n'))
		assert.match(calls[0], /^app\/server\/src\/routes\/search\.ts: маршрут поиска не вызывает testScope\(/)

		assert.deepEqual(webViolations(REPO_ROOT), [])
		assert.deepEqual(testsReadViolations(REPO_ROOT), [])
		assert.deepEqual(searchViolations(REPO_ROOT), [])
		assert.deepEqual(requiredScopeCallsViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})
