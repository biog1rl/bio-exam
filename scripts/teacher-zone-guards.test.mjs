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

const SERVER_ROOT = 'app/server/src'
const WEB_ROOT = 'app/web'
const ACCESS_POLICY_DIR = 'app/server/src/services/access-policy/'
const SCHEMA_FILE = 'app/server/src/db/schema.ts'
const TEST_SUPPORT_DIR = 'app/server/src/test-support/'
const TEACHER_ZONE_WORLD = 'app/server/src/test-support/teacher-zone-world.ts'

const TESTS_ROUTES = 'app/server/src/routes/tests/index.ts'
const ASSIGNMENT_ROUTES = 'app/server/src/routes/tests/assignments.ts'
const GROUP_ROUTES = 'app/server/src/routes/groups/index.ts'
const USER_ROUTES = 'app/server/src/routes/users/index.ts'
const LOGIN_THROTTLE_ROUTES = 'app/server/src/routes/users/login-throttle.ts'
const SESSION_ROUTES = 'app/server/src/routes/users/sessions.ts'
const INVITE_ROUTES = 'app/server/src/routes/auth/invites.ts'

const ROUTE_FILES = {
	[TESTS_ROUTES]: { router: 'router', mount: '/api/tests' },
	[ASSIGNMENT_ROUTES]: { router: 'assignmentsRouter', mount: '/api/tests/:testId/assignments' },
	[GROUP_ROUTES]: { router: 'groupsRouter', mount: '/api/groups' },
	[USER_ROUTES]: { router: 'router', mount: '/api/users' },
	[LOGIN_THROTTLE_ROUTES]: { router: 'router', mount: '/api/users' },
	[SESSION_ROUTES]: { router: 'router', mount: '/api/users' },
	[INVITE_ROUTES]: { router: 'router', mount: '/api/auth/invites' },
}

const OBJECT = 'объектный маршрут'
const LIST = 'список'
const COARSE = 'грубый гейт и вызовы шва'

const REMOVE_ASSIGNMENT = 'removeAssignment('

const route = (file, method, routePath, kind, calls) => ({ file, method, path: routePath, kind, calls })

const INVENTORY = [
	...[
		['post', '/topics'],
		['patch', '/topics/:id'],
		['delete', '/topics/:id'],
		['put', '/topics/:id/teachers'],
		['get', '/topics/teacher-options'],
		['post', '/question-types'],
		['patch', '/question-types/:key'],
		['delete', '/question-types/:key'],
		['put', '/scoring-rules/global'],
	].map(([method, routePath]) => route(TESTS_ROUTES, method, routePath, OBJECT, ['canManageCatalog('])),
	...[
		['get', '/question-types/tests/:id/overrides'],
		['get', '/scoring-rules/tests/:id'],
	].map(([method, routePath]) => route(TESTS_ROUTES, method, routePath, OBJECT, ['canReadTest('])),
	...[
		['put', '/question-types/tests/:id/overrides/:key'],
		['delete', '/question-types/tests/:id/overrides/:key'],
		['put', '/scoring-rules/tests/:id'],
		['post', '/:testId/question-drafts'],
		['get', '/:testId/question-drafts'],
		['get', '/:testId/question-drafts/:draftId'],
		['patch', '/:testId/question-drafts/:draftId'],
		['delete', '/:testId/question-drafts/:draftId'],
	].map(([method, routePath]) => route(TESTS_ROUTES, method, routePath, OBJECT, ['canWriteTest('])),
	route(TESTS_ROUTES, 'get', '/admin/attempts/:attemptId', OBJECT, ['canReviewAttempt(']),
	...['/topics', '/', '/admin/dashboard', '/admin/attempts'].map((routePath) =>
		route(TESTS_ROUTES, 'get', routePath, LIST, ['testScope('])
	),
	route(ASSIGNMENT_ROUTES, 'get', '/', OBJECT, ['canReadTest(']),
	route(ASSIGNMENT_ROUTES, 'post', '/', OBJECT, ['canAssign(']),
	route(ASSIGNMENT_ROUTES, 'delete', '/:userId', OBJECT, [REMOVE_ASSIGNMENT]),
	route(ASSIGNMENT_ROUTES, 'post', '/group/:groupId', OBJECT, ['canWriteTest(', 'canManageGroup(', 'canAssignMany(']),
	...['get', 'patch', 'delete'].map((method) => route(GROUP_ROUTES, method, '/:groupId', OBJECT, ['canManageGroup('])),
	route(GROUP_ROUTES, 'get', '/', LIST, ['groupScope(']),
	route(USER_ROUTES, 'get', '/:userId/test-assignments', OBJECT, ['canReadUser(']),
	route(USER_ROUTES, 'post', '/:userId/test-assignments', OBJECT, ['canAssign(']),
	route(USER_ROUTES, 'delete', '/:userId/test-assignments/:testId', OBJECT, [REMOVE_ASSIGNMENT]),
	route(USER_ROUTES, 'get', '/', LIST, ['userScope(']),
	route(USER_ROUTES, 'get', '/:userId/test-attempts', LIST, ['testScope(']),
	route(LOGIN_THROTTLE_ROUTES, 'delete', '/:id/login-throttle', OBJECT, ['canAssistSignIn(']),
	route(SESSION_ROUTES, 'post', '/:id/sessions/revoke', OBJECT, ['canAssistSignIn(']),
	route(INVITE_ROUTES, 'post', '/', COARSE, ['hasGlobalZone(', 'canManageGroup(', 'canManageStudent(']),
	route(GROUP_ROUTES, 'post', '/', COARSE, ['hasGlobalZone(', 'setGroupOwner(']),
	route(GROUP_ROUTES, 'get', '/candidates', COARSE, ['studentOnlyFilter(']),
	route(GROUP_ROUTES, 'get', '/owner-options', COARSE, ['hasGlobalZone(', 'zoneOwnerCandidates(']),
]

const TABLE_CHECKS = [
	{ label: 'идентификатор teacherTopics', match: (line) => /\bteacherTopics\b/.test(line) },
	{ label: 'колонка studentGroups.ownerId', match: (line) => /\bstudentGroups\.ownerId\b/.test(line) },
	{ label: 'SQL-имя teacher_topics', match: (line) => line.includes('teacher_topics') },
	{
		label: 'owner_id в строке со student_groups',
		match: (line) => /\bstudent_groups\b/.test(line) && /\bowner_id\b/.test(line),
	},
]

const TABLE_EXCEPTIONS = [
	{ path: SCHEMA_FILE, reason: 'описание таблицы teacher_topics и колонки student_groups.owner_id' },
	{
		path: TEST_SUPPORT_DIR,
		reason: 'фикстуры матриц доступа закрепляют разделы и группы за учителями в тестовой базе',
	},
]

const ZONE_ALL_CHECKS = [
	{
		label: "hasPermission(req, 'zone.all'): ветвление «админ или учитель» через hasGlobalZone",
		match: (line) => /\bhasPermission\(\s*req\s*,\s*['"\x60]zone\.all['"\x60]\s*\)/.test(line),
	},
	{
		label: "литерал 'zone.all' вне services/access-policy",
		match: (line) => /['"\x60]zone\.all['"\x60]/.test(line),
	},
]

const ZONE_ALL_EXCEPTIONS = [
	{
		file: TEACHER_ZONE_WORLD,
		reason: 'фикстуры матриц доступа: переопределения zone.all у тестовых администраторов',
		fragment: "key: 'zone.all'",
		count: 3,
	},
]

function toRelative(root, file) {
	return path.relative(root, file).split(path.sep).join('/')
}

function collectSources(root, relativeDir, includeTests = false) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue
			if (!includeTests && TEST_FILE.test(entry.name)) continue
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

function scanFiles(root, files, checks, skipHit = () => false) {
	const violations = []
	for (const relative of files) {
		const hits = findLines(checks, fs.readFileSync(path.join(root, relative), 'utf8')).filter(
			(hit) => !skipHit(relative, hit)
		)
		violations.push(...formatHits(relative, hits))
	}
	return violations
}

function tableExceptionFor(relative) {
	return TABLE_EXCEPTIONS.find((item) =>
		item.path.endsWith('/') ? relative.startsWith(item.path) : relative === item.path
	)
}

function serverFilesOutsidePolicy(root) {
	return collectSources(root, SERVER_ROOT).filter((file) => !file.startsWith(ACCESS_POLICY_DIR))
}

function tableViolations(root) {
	return scanFiles(
		root,
		serverFilesOutsidePolicy(root).filter((file) => !tableExceptionFor(file)),
		TABLE_CHECKS
	)
}

function webTableViolations(root) {
	return scanFiles(root, collectSources(root, WEB_ROOT, true), TABLE_CHECKS)
}

function zoneAllExceptionFor(relative, text) {
	return ZONE_ALL_EXCEPTIONS.find((item) => item.file === relative && text.includes(item.fragment))
}

function zoneAllViolations(root) {
	return scanFiles(root, serverFilesOutsidePolicy(root), ZONE_ALL_CHECKS, (relative, hit) =>
		Boolean(zoneAllExceptionFor(relative, hit.text))
	)
}

function registrations(source, routerName) {
	const found = []
	for (const part of `\n${source}`.split(`\n${routerName}.`).slice(1)) {
		const head = part.includes('async') ? part.slice(0, part.indexOf('async')) : part
		const match = /^(get|post|patch|put|delete)\(\s*(['"\x60])([^'"\x60]*)\2/.exec(head)
		if (match) found.push({ method: match[1], path: match[3], head, body: part })
	}
	return found
}

function routeLabel(item) {
	return `${item.method.toUpperCase()} ${ROUTE_FILES[item.file].mount}${item.path === '/' ? '' : item.path}`
}

function inventoryViolations(root, inventory = INVENTORY) {
	const problems = []
	const sources = new Map()
	for (const item of inventory) {
		if (!sources.has(item.file)) {
			const source = fs.readFileSync(path.join(root, item.file), 'utf8')
			sources.set(item.file, registrations(source, ROUTE_FILES[item.file].router))
		}
		const label = `${item.file}: ${routeLabel(item)} (${item.kind})`
		const matches = sources.get(item.file).filter((reg) => reg.method === item.method && reg.path === item.path)
		if (matches.length !== 1) {
			problems.push(`${label}: регистраций найдено ${matches.length}, ожидалась одна`)
			continue
		}
		const [reg] = matches
		if (item.kind === OBJECT && reg.head.includes('requirePerm(')) {
			problems.push(`${label}: requirePerm( в регистрации, доступ решает функция шва`)
		}
		for (const call of item.calls) {
			if (!reg.body.includes(call)) problems.push(`${label}: обработчик не вызывает ${call}`)
		}
	}
	return problems
}

function functionBody(source, signature) {
	const start = source.indexOf(signature)
	if (start === -1) return null
	const open = source.indexOf('{', start)
	let depth = 0
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++
		else if (source[i] === '}') {
			depth--
			if (depth === 0) return source.slice(open + 1, i)
		}
	}
	return null
}

function removeAssignmentViolations(root) {
	const signature = 'export async function removeAssignment('
	const body = functionBody(fs.readFileSync(path.join(root, ASSIGNMENT_ROUTES), 'utf8'), signature)
	if (body === null) return [`${ASSIGNMENT_ROUTES}: нет функции removeAssignment`]
	const first = body
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean)
	if (!first || !first.includes('canAssign(')) {
		return [
			`${ASSIGNMENT_ROUTES}: removeAssignment не начинается с вызова canAssign( (снятие назначения в DELETE ${ROUTE_FILES[ASSIGNMENT_ROUTES].mount}/:userId и DELETE /api/users/:userId/test-assignments/:testId)`,
		]
	}
	return []
}

function copyFile(tmp, relative, transform = (source) => source) {
	const target = path.join(tmp, relative)
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.writeFileSync(target, transform(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8')))
}

function replaceInPart(source, marker, from, to) {
	const start = source.indexOf(marker)
	assert.notEqual(start, -1, marker)
	const rest = source.slice(start + marker.length)
	const next = rest.search(/\n(?:[a-zA-Z]+Router|router)\.|\nexport /)
	const end = next === -1 ? source.length : start + marker.length + next
	const part = source.slice(start, end)
	assert.ok(part.includes(from), `${marker}: нет ${from}`)
	return source.slice(0, start) + part.replaceAll(from, to) + source.slice(end)
}

const q = '\u0027'

test('детектор таблиц зоны находит запрещённые строки и пропускает разрешённые', () => {
	for (const sample of [
		'const rows = await db.select().from(teacherTopics)',
		'.where(eq(studentGroups.ownerId, userId))',
		'const result = await pool.query(`SELECT topic_id FROM teacher_topics WHERE teacher_id = $1`, [id])',
		'await pool.query(`UPDATE student_groups SET owner_id = $1 WHERE id = $2`, [owner, id])',
	]) {
		assert.ok(findLines(TABLE_CHECKS, sample).length > 0, sample)
	}
	for (const sample of [
		'const ownerId = parsed.data.ownerId',
		'.where(eq(questionDrafts.ownerId, userId))',
		'SELECT id FROM question_drafts WHERE question_drafts.owner_id = $1',
		'await setGroupOwner(tx, groupId, ownerId)',
		'const owners = await groupOwners(groupIds)',
	]) {
		assert.deepEqual(findLines(TABLE_CHECKS, sample), [], sample)
	}
})

test('детектор zone.all находит hasPermission и литерал и пропускает hasGlobalZone', () => {
	const both = findLines(ZONE_ALL_CHECKS, `if (await hasPermission(req, ${q}zone.all${q})) return next()`)
	assert.equal(both.length, 1)
	assert.equal(both[0].labels.length, 2)
	assert.ok(findLines(ZONE_ALL_CHECKS, `const key = "zone.all"`).length > 0)
	assert.deepEqual(findLines(ZONE_ALL_CHECKS, 'if (await hasGlobalZone(req)) return next()'), [])
	assert.deepEqual(findLines(ZONE_ALL_CHECKS, 'const zoneAll = scope.all'), [])
})

test('разбор регистраций учитывает имя роутера и тело обработчика до следующей регистрации', () => {
	const source = [
		`groupsRouter.get(${q}/:groupId${q}, validateUUID(${q}groupId${q}), sessionRequired(), async (req, res) => {`,
		`\tif (!(await canManageGroup(req, id))) return res.status(403).end()`,
		'})',
		'',
		'groupsRouter.post(',
		`\t${q}/${q},`,
		'\tsessionRequired(),',
		`\trequirePerm(${q}groups${q}, ${q}manage_groups${q}),`,
		'\tasync (req, res) => {',
		'\t\tawait setGroupOwner(tx, id, owner)',
		'\t}',
		')',
		`router.get(${q}/ignored${q}, async () => {})`,
	].join('\n')
	const parsed = registrations(source, 'groupsRouter')
	assert.equal(parsed.length, 2)
	assert.equal(parsed[0].method, 'get')
	assert.equal(parsed[0].path, '/:groupId')
	assert.ok(parsed[0].body.includes('canManageGroup('))
	assert.ok(!parsed[0].body.includes('setGroupOwner('))
	assert.equal(parsed[1].method, 'post')
	assert.equal(parsed[1].path, '/')
	assert.ok(parsed[1].head.includes('requirePerm('))
	assert.ok(parsed[1].body.includes('setGroupOwner('))
})

test('таблицы зоны в app/server/src читаются и пишутся только в services/access-policy', () => {
	const files = collectSources(REPO_ROOT, SERVER_ROOT)
	assert.ok(files.length >= 50, `${SERVER_ROOT}: просканировано файлов: ${files.length}`)
	const policyFiles = collectSources(REPO_ROOT, ACCESS_POLICY_DIR)
	assert.ok(
		scanFiles(REPO_ROOT, policyFiles, TABLE_CHECKS).length > 0,
		`${ACCESS_POLICY_DIR}: нет обращений к таблицам зоны`
	)
	assert.deepEqual(tableViolations(REPO_ROOT), [], 'зону читает и пишет services/access-policy (D-29)')
})

test('каждое исключение правила таблиц существует, у него есть причина и детектор находит в нём строки', () => {
	for (const item of TABLE_EXCEPTIONS) {
		assert.ok(item.reason, `${item.path}: нет причины исключения`)
		const files = item.path.endsWith('/') ? collectSources(REPO_ROOT, item.path) : [item.path]
		assert.ok(
			files.every((file) => fs.existsSync(path.join(REPO_ROOT, file))),
			`${item.path}: исключение не существует`
		)
		assert.ok(files.length > 0, `${item.path}: исключение не существует`)
		assert.ok(scanFiles(REPO_ROOT, files, TABLE_CHECKS).length > 0, `${item.path}: детектор ничего не находит`)
	}
})

test('в app/web нет teacherTopics, studentGroups.ownerId и SQL таблиц зоны', () => {
	const files = collectSources(REPO_ROOT, WEB_ROOT, true)
	assert.ok(files.length >= 100, `${WEB_ROOT}: просканировано файлов: ${files.length}`)
	assert.deepEqual(webTableViolations(REPO_ROOT), [])
})

test("в app/server/src вне access-policy нет hasPermission(req, 'zone.all') и литерала 'zone.all'", () => {
	assert.ok(serverFilesOutsidePolicy(REPO_ROOT).length >= 50)
	assert.deepEqual(zoneAllViolations(REPO_ROOT), [], 'ветвление «админ или учитель» через hasGlobalZone')
})

test('каждое исключение правила zone.all существует ровно в заявленном числе и ловится детектором', () => {
	for (const item of ZONE_ALL_EXCEPTIONS) {
		assert.ok(item.reason, `${item.file}: нет причины исключения`)
		const source = fs.readFileSync(path.join(REPO_ROOT, item.file), 'utf8')
		const lines = source.split('\n').filter((line) => line.includes(item.fragment))
		assert.equal(lines.length, item.count, `${item.file}: ${item.fragment}`)
		const detected = findLines(ZONE_ALL_CHECKS, source).filter((hit) => hit.text.includes(item.fragment))
		assert.equal(detected.length, item.count, `${item.file}: детектор не видит ${item.fragment}`)
		assert.equal(findLines(ZONE_ALL_CHECKS, source).length, item.count, `${item.file}: строки zone.all вне исключения`)
	}
})

test('маршруты инвентаря D-14 решают доступ функциями шва', () => {
	for (const [file, config] of Object.entries(ROUTE_FILES)) {
		const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')
		assert.ok(registrations(source, config.router).length > 0, `${file}: нет регистраций ${config.router}`)
	}
	assert.equal(INVENTORY.length, 43)
	assert.deepEqual(inventoryViolations(REPO_ROOT), [])
})

test('removeAssignment, через которую снимают назначение оба DELETE, первой строкой вызывает canAssign', () => {
	for (const file of [ASSIGNMENT_ROUTES, USER_ROUTES]) {
		const routes = INVENTORY.filter((item) => item.file === file && item.calls.includes(REMOVE_ASSIGNMENT))
		assert.equal(routes.length, 1, file)
	}
	assert.deepEqual(removeAssignmentViolations(REPO_ROOT), [])
})

test('проба: строка с teacherTopics в копии маршрута групп даёт нарушение с путём файла', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-zone-guards-'))
	try {
		copyFile(tmp, GROUP_ROUTES, (source) => `${source}\nconst rows = await db.select().from(teacherTopics)\n`)
		const found = tableViolations(tmp)
		assert.equal(found.length, 1, found.join('\n'))
		assert.match(found[0], /^app\/server\/src\/routes\/groups\/index\.ts:\d+: идентификатор teacherTopics: /)
		assert.deepEqual(tableViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})

test('проба: requirePerm на объектном маршруте, удалённый вызов шва и zone.all в копиях маршрутов дают нарушения', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-zone-guards-'))
	try {
		for (const file of Object.keys(ROUTE_FILES)) copyFile(tmp, file)
		const teachersRoute = `router.put(${q}/topics/:id/teachers${q}, validateUUID(${q}id${q}), sessionRequired(), async`
		copyFile(tmp, TESTS_ROUTES, (source) => {
			assert.ok(source.includes(teachersRoute), teachersRoute)
			return source.replace(
				teachersRoute,
				`router.put(${q}/topics/:id/teachers${q}, validateUUID(${q}id${q}), sessionRequired(), requirePerm(${q}tests${q}, ${q}write${q}), async`
			)
		})
		copyFile(tmp, ASSIGNMENT_ROUTES, (source) => {
			const withoutPost = replaceInPart(source, `assignmentsRouter.post(${q}/${q}`, 'canAssign(', 'probeCall(')
			return replaceInPart(withoutPost, 'export async function removeAssignment(', 'canAssign(', 'probeCall(')
		})
		copyFile(tmp, INVITE_ROUTES, (source) => {
			const withoutStudent = replaceInPart(source, `router.post(${q}/${q}`, 'canManageStudent(', 'probeCall(')
			return `${withoutStudent}\nif (await hasPermission(req, ${q}zone.all${q})) {}\n`
		})

		const inventory = inventoryViolations(tmp)
		assert.deepEqual(inventory, [
			`${TESTS_ROUTES}: PUT /api/tests/topics/:id/teachers (${OBJECT}): requirePerm( в регистрации, доступ решает функция шва`,
			`${ASSIGNMENT_ROUTES}: POST /api/tests/:testId/assignments (${OBJECT}): обработчик не вызывает canAssign(`,
			`${INVITE_ROUTES}: POST /api/auth/invites (${COARSE}): обработчик не вызывает canManageStudent(`,
		])

		const helper = removeAssignmentViolations(tmp)
		assert.equal(helper.length, 1, helper.join('\n'))
		assert.match(
			helper[0],
			/^app\/server\/src\/routes\/tests\/assignments\.ts: removeAssignment не начинается с вызова canAssign\(/
		)

		const zoneAll = zoneAllViolations(tmp)
		assert.equal(zoneAll.length, 1, zoneAll.join('\n'))
		assert.match(zoneAll[0], /^app\/server\/src\/routes\/auth\/invites\.ts:\d+: hasPermission\(req, 'zone\.all'\)/)

		assert.deepEqual(inventoryViolations(REPO_ROOT), [])
		assert.deepEqual(zoneAllViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})
