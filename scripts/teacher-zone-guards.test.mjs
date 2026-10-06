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

const TOPIC_ROUTES = 'app/server/src/routes/tests/admin/topics.ts'
const TESTS_LIST_ROUTES = 'app/server/src/routes/tests/admin/tests-list.ts'
const TESTS_BY_SLUG_ROUTES = 'app/server/src/routes/tests/admin/tests-by-slug.ts'
const QUESTION_TYPE_ROUTES = 'app/server/src/routes/tests/admin/question-types.ts'
const SCORING_RULE_ROUTES = 'app/server/src/routes/tests/admin/scoring-rules.ts'
const QUESTION_DRAFT_ROUTES = 'app/server/src/routes/tests/admin/question-drafts.ts'
const TESTS_CORE_ROUTES = 'app/server/src/routes/tests/admin/tests-core.ts'
const QUESTION_ROUTES = 'app/server/src/routes/tests/admin/questions.ts'
const TESTS_DELETE_ROUTES = 'app/server/src/routes/tests/admin/tests-delete.ts'
const ASSET_ROUTES = 'app/server/src/routes/tests/admin/assets.ts'
const EXPORT_ROUTES = 'app/server/src/routes/tests/admin/export.ts'
const ATTEMPT_ROUTES = 'app/server/src/routes/tests/admin/attempts.ts'
const ASSIGNMENT_ROUTES = 'app/server/src/routes/tests/assignments.ts'
const GROUP_ROUTES = 'app/server/src/routes/groups/index.ts'
const USER_ROUTES = 'app/server/src/routes/users/index.ts'
const SIGN_IN_ASSIST_ROUTES = 'app/server/src/routes/users/sign-in-assist.ts'
const INVITE_ROUTES = 'app/server/src/routes/auth/invites.ts'

const ROUTE_FILES = {
	[TOPIC_ROUTES]: { router: 'router', mount: '/api/tests' },
	[TESTS_LIST_ROUTES]: { router: 'router', mount: '/api/tests' },
	[TESTS_BY_SLUG_ROUTES]: { router: 'router', mount: '/api/tests' },
	[QUESTION_TYPE_ROUTES]: { router: 'router', mount: '/api/tests' },
	[SCORING_RULE_ROUTES]: { router: 'router', mount: '/api/tests' },
	[QUESTION_DRAFT_ROUTES]: { router: 'router', mount: '/api/tests' },
	[TESTS_CORE_ROUTES]: { router: 'router', mount: '/api/tests' },
	[QUESTION_ROUTES]: { router: 'router', mount: '/api/tests' },
	[TESTS_DELETE_ROUTES]: { router: 'router', mount: '/api/tests' },
	[ASSET_ROUTES]: { router: 'router', mount: '/api/tests' },
	[EXPORT_ROUTES]: { router: 'router', mount: '/api/tests' },
	[ATTEMPT_ROUTES]: { router: 'router', mount: '/api/tests' },
	[ASSIGNMENT_ROUTES]: { router: 'assignmentsRouter', mount: '/api/tests/:testId/assignments' },
	[GROUP_ROUTES]: { router: 'groupsRouter', mount: '/api/groups' },
	[USER_ROUTES]: { router: 'router', mount: '/api/users' },
	[SIGN_IN_ASSIST_ROUTES]: { router: 'router', mount: '/api/users' },
	[INVITE_ROUTES]: { router: 'router', mount: '/api/auth/invites' },
}

const OBJECT = 'объектный маршрут'
const LIST = 'список'
const COARSE = 'грубый гейт и вызовы шва'

const REMOVE_ASSIGNMENT = 'removeAssignment('

const route = (file, method, routePath, kind, calls) => ({ file, method, path: routePath, kind, calls })

const INVENTORY = [
	...[
		[TOPIC_ROUTES, 'post', '/topics'],
		[TOPIC_ROUTES, 'patch', '/topics/:id'],
		[TOPIC_ROUTES, 'delete', '/topics/:id'],
		[TOPIC_ROUTES, 'put', '/topics/:id/teachers'],
		[TOPIC_ROUTES, 'get', '/topics/teacher-options'],
		[QUESTION_TYPE_ROUTES, 'post', '/question-types'],
		[QUESTION_TYPE_ROUTES, 'patch', '/question-types/:key'],
		[QUESTION_TYPE_ROUTES, 'delete', '/question-types/:key'],
		[SCORING_RULE_ROUTES, 'put', '/scoring-rules/global'],
	].map(([file, method, routePath]) => route(file, method, routePath, OBJECT, ['canManageCatalog('])),
	...[
		[QUESTION_TYPE_ROUTES, 'get', '/question-types/tests/:id/overrides'],
		[SCORING_RULE_ROUTES, 'get', '/scoring-rules/tests/:id'],
	].map(([file, method, routePath]) => route(file, method, routePath, OBJECT, ['canReadTest('])),
	...[
		[QUESTION_TYPE_ROUTES, 'put', '/question-types/tests/:id/overrides/:key'],
		[QUESTION_TYPE_ROUTES, 'delete', '/question-types/tests/:id/overrides/:key'],
		[SCORING_RULE_ROUTES, 'put', '/scoring-rules/tests/:id'],
		[QUESTION_DRAFT_ROUTES, 'post', '/:testId/question-drafts'],
		[QUESTION_DRAFT_ROUTES, 'get', '/:testId/question-drafts'],
		[QUESTION_DRAFT_ROUTES, 'get', '/:testId/question-drafts/:draftId'],
		[QUESTION_DRAFT_ROUTES, 'patch', '/:testId/question-drafts/:draftId'],
		[QUESTION_DRAFT_ROUTES, 'delete', '/:testId/question-drafts/:draftId'],
	].map(([file, method, routePath]) => route(file, method, routePath, OBJECT, ['canWriteTest('])),
	route(ATTEMPT_ROUTES, 'get', '/admin/attempts/:attemptId', OBJECT, ['canReviewAttempt(']),
	...[
		[TOPIC_ROUTES, '/topics'],
		[TESTS_LIST_ROUTES, '/'],
		[ATTEMPT_ROUTES, '/admin/dashboard'],
		[ATTEMPT_ROUTES, '/admin/attempts'],
	].map(([file, routePath]) => route(file, 'get', routePath, LIST, ['testScope('])),
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
	route(USER_ROUTES, 'get', '/:id', COARSE, ['canReadUser(']),
	route(USER_ROUTES, 'get', '/by-login/:login', COARSE, ['canReadUser(', 'hasGlobalZone(']),
	route(SIGN_IN_ASSIST_ROUTES, 'delete', '/:id/login-throttle', OBJECT, ['canAssistSignIn(']),
	route(SIGN_IN_ASSIST_ROUTES, 'post', '/:id/sessions/revoke', OBJECT, ['canAssistSignIn(']),
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

const OWNER_WORD = /\b(?:ownerId|owner_id)\b/
const GROUP_WRITE_CALL = /\b(?:insert|update)\(\s*(?:\w+\.)?studentGroups\s*\)\s*\.(?:values|set)\(/g
const TEMPLATE_LITERAL = /`[^`]*`/g

function balancedEnd(source, open) {
	let depth = 0
	for (let i = open; i < source.length; i++) {
		if (source[i] === '(') depth++
		else if (source[i] === ')') {
			depth--
			if (depth === 0) return i
		}
	}
	return source.length
}

function groupOwnerWriteOffsets(source) {
	const offsets = []
	for (const match of source.matchAll(GROUP_WRITE_CALL)) {
		const open = match.index + match[0].length - 1
		if (OWNER_WORD.test(source.slice(open, balancedEnd(source, open)))) offsets.push(match.index)
	}
	return offsets
}

function multilineSqlOffsets(source) {
	const offsets = []
	for (const match of source.matchAll(TEMPLATE_LITERAL)) {
		if (!match[0].includes('\n')) continue
		if (/\bstudent_groups\b/.test(match[0]) && /\bowner_id\b/.test(match[0])) offsets.push(match.index)
	}
	return offsets
}

TABLE_CHECKS.push(
	{ label: 'запись ownerId в studentGroups через .values( или .set(', scan: groupOwnerWriteOffsets },
	{ label: 'owner_id и student_groups в одном многострочном SQL', scan: multilineSqlOffsets }
)

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
	const lines = source.split('\n')
	const byLine = new Map()
	const add = (index, label) => {
		if (!byLine.has(index)) byLine.set(index, [])
		const labels = byLine.get(index)
		if (!labels.includes(label)) labels.push(label)
	}
	lines.forEach((line, index) => {
		for (const check of checks) if (check.match && check.match(line)) add(index, check.label)
	})
	for (const check of checks) {
		if (!check.scan) continue
		for (const offset of check.scan(source)) add(source.slice(0, offset).split('\n').length - 1, check.label)
	}
	return [...byLine.keys()]
		.sort((a, b) => a - b)
		.map((index) => ({ line: index + 1 + lineOffset, text: lines[index].trim(), labels: byLine.get(index) }))
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

test('детектор таблиц зоны ловит запись ownerId через .values(, .set( и многострочный SQL', () => {
	const violating = [
		'await tx.insert(studentGroups).values({ name, createdBy, ownerId })',
		'await tx.update(studentGroups).set({ ownerId: next }).where(eq(studentGroups.id, id))',
		'await tx\n\t.insert(schema.studentGroups)\n\t.values({\n\t\tname,\n\t\towner_id: owner,\n\t})\n\t.returning()',
		'await db\n\t.update(studentGroups)\n\t.set({\n\t\tname,\n\t\tupdatedAt: new Date(),\n\t\townerId: owner,\n\t})',
		'await pool.query(`\n\tUPDATE student_groups\n\tSET owner_id = $1\n\tWHERE id = $2\n`, [owner, id])',
		'await pool.query(`\n\tINSERT INTO student_groups (name, created_by, owner_id)\n\tVALUES ($1, $2, $3)\n`)',
	]
	for (const sample of violating) {
		const hits = findLines(TABLE_CHECKS, sample)
		assert.ok(hits.length > 0, sample)
	}
	const multiline = findLines(TABLE_CHECKS, violating[2])
	assert.equal(multiline.length, 1)
	assert.equal(multiline[0].line, 2)
	const allowed = [
		'await tx.insert(studentGroups).values({ name, createdBy: requesterId }).returning()',
		'await tx.update(studentGroups).set({ name, updatedAt: new Date() }).where(eq(studentGroups.id, id))',
		'await tx\n\t.insert(studentGroups)\n\t.values({ name, createdBy })\n\t.returning()\nawait setGroupOwner(tx, { groupId, ownerId })',
		'await tx.insert(questionDrafts).values({ ownerId, testId })',
		'await tx.update(questionDrafts).set({ ownerId: next }).where(eq(questionDrafts.id, id))',
		'await pool.query(`\n\tUPDATE question_drafts\n\tSET owner_id = $1\n`, [owner])',
		'await pool.query(`\n\tselect sg.id\n\tfrom student_groups sg\n\twhere sg.id = $1\n`)',
	]
	for (const sample of allowed) assert.deepEqual(findLines(TABLE_CHECKS, sample), [], sample)
})

test('проба: запись ownerId через .set( и многострочный SQL в копии маршрута групп даёт нарушения с путём файла', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-zone-guards-'))
	try {
		copyFile(
			tmp,
			GROUP_ROUTES,
			(source) =>
				`${source}\nawait tx.update(studentGroups)\n\t.set({ ownerId: next })\n\t.where(eq(studentGroups.id, id))\nawait pool.query(\x60\n\tUPDATE student_groups\n\tSET owner_id = $1\n\x60)\n`
		)
		const found = tableViolations(tmp)
		assert.equal(found.length, 2, found.join('\n'))
		assert.match(found[0], /^app\/server\/src\/routes\/groups\/index\.ts:\d+: запись ownerId в studentGroups/)
		assert.match(found[1], /^app\/server\/src\/routes\/groups\/index\.ts:\d+: owner_id и student_groups/)
		assert.deepEqual(tableViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
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
	assert.equal(INVENTORY.length, 45)
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
		copyFile(tmp, TOPIC_ROUTES, (source) => {
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
			`${TOPIC_ROUTES}: PUT /api/tests/topics/:id/teachers (${OBJECT}): requirePerm( в регистрации, доступ решает функция шва`,
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
