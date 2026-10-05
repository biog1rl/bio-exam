import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type FreshTest,
	type TeacherZoneWorld,
	type ZoneAttemptKey,
	type ZoneGroupKey,
	type ZoneProfile,
	type ZoneTestKey,
	type ZoneTopicKey,
} from '../../test-support/teacher-zone-world.js'

const KNOWN_DEFECTS = new Set<string>([])

function check(id: string, title: string, fn: () => Promise<void>): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn)
}

type Row = { profile: ZoneProfile; route: string; title: string; run: (profile: ZoneProfile) => Promise<void> }

type Item = Record<string, unknown>

const WORLD_PEOPLE: ZoneProfile[] = [
	'admin',
	'teacherA',
	'teacherB',
	'teacherOff',
	's1',
	's2',
	's3',
	'invited',
	'readTests',
	'readTestsAll',
	'readUsers',
	'readUsersAll',
	'adminNoZone',
]

let ctx: AuthApp
let w: TeacherZoneWorld

function send(profile: ZoneProfile, method: string, path: string, body?: unknown): Promise<Reply> {
	return call(ctx, method, `/api${path}`, { cookies: w.users[profile].cookie, body })
}

function expectStatus(reply: { status: number; body?: unknown }, status: number): void {
	assert.equal(reply.status, status, `ожидался ${status}, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
}

function rowsOf(list: unknown, name: string): Item[] {
	assert.ok(Array.isArray(list), `нет списка ${name}`)
	return list as Item[]
}

function keysOf<K extends string>(ids: Record<K, string>, values: unknown[]): K[] {
	const byId = new Map(Object.entries(ids).map(([key, id]) => [id as string, key as K]))
	return values
		.map((value) => byId.get(String(value)))
		.filter((key): key is K => key !== undefined)
		.sort()
}

function personIds(): Record<ZoneProfile, string> {
	return Object.fromEntries(WORLD_PEOPLE.map((profile) => [profile, w.users[profile].id])) as Record<
		ZoneProfile,
		string
	>
}

function worldPeople(list: Item[]): ZoneProfile[] {
	return keysOf(
		personIds(),
		list.map((item) => item.id)
	)
}

function worldTests(list: Item[]): ZoneTestKey[] {
	const ids = Object.fromEntries(Object.entries(w.tests).map(([key, value]) => [key, value.id])) as Record<
		ZoneTestKey,
		string
	>
	return keysOf(
		ids,
		list.map((item) => item.testId)
	)
}

function worldAttempts(list: Item[]): ZoneAttemptKey[] {
	return keysOf(
		w.attempts,
		list.map((item) => item.attemptId)
	)
}

function sorted<T extends string>(values: T[]): T[] {
	return [...values].sort()
}

async function listUsers(profile: ZoneProfile): Promise<{ rows: Item[]; total: unknown }> {
	const reply = await send(profile, 'GET', '/users?limit=500')
	expectStatus(reply, 200)
	return { rows: rowsOf(reply.body.rows, 'пользователей'), total: reply.body.total }
}

async function assignmentExists(testId: string, userId: string): Promise<boolean> {
	const result = await ctx.pgPool.query('SELECT 1 FROM test_assignments WHERE test_id = $1 AND user_id = $2', [
		testId,
		userId,
	])
	return (result.rowCount ?? 0) > 0
}

async function insertAssignment(testId: string, userId: string, assignedBy: string): Promise<void> {
	await ctx.db.insert(ctx.schema.testAssignments).values({ testId, userId, assignedBy })
}

async function attachTopic(teacherId: string, topicId: string): Promise<void> {
	await ctx.db.insert(ctx.schema.teacherTopics).values({ teacherId, topicId, assignedBy: w.users.admin.id })
}

async function addRole(userId: string, roleKey: string): Promise<void> {
	await ctx.db.insert(ctx.schema.userRoles).values({ userId, roleKey })
}

async function rolesOf(userId: string): Promise<string[]> {
	const result = await ctx.pgPool.query<{ role_key: string }>(
		'SELECT role_key FROM user_roles WHERE user_id = $1 ORDER BY role_key',
		[userId]
	)
	return result.rows.map((item) => item.role_key)
}

async function topicCountOf(teacherId: string): Promise<number> {
	const result = await ctx.pgPool.query('SELECT 1 FROM teacher_topics WHERE teacher_id = $1', [teacherId])
	return result.rowCount ?? 0
}

async function ownerOf(groupId: string): Promise<string | null> {
	const result = await ctx.pgPool.query<{ owner_id: string | null }>(
		'SELECT owner_id FROM student_groups WHERE id = $1',
		[groupId]
	)
	assert.ok(result.rows[0], `группа ${groupId} не найдена`)
	return result.rows[0].owner_id
}

async function groupsOf(userId: string): Promise<ZoneGroupKey[]> {
	const result = await ctx.pgPool.query<{ group_id: string }>('SELECT group_id FROM user_groups WHERE user_id = $1', [
		userId,
	])
	const keys = keysOf(
		w.groups,
		result.rows.map((item) => item.group_id)
	)
	assert.equal(keys.length, result.rows.length, `у ученика есть группы вне мира: ${JSON.stringify(result.rows)}`)
	return keys
}

async function ownStudent(): Promise<string> {
	return (await w.freshUser({ groups: [w.groups.G] })).id
}

async function ungroupedStudent(): Promise<string> {
	return (await w.freshUser()).id
}

function freshTestOf(topic: ZoneTopicKey): Promise<FreshTest> {
	return w.freshTest(topic)
}

async function zoneTeacher(extraRoles: string[] = []): Promise<{ id: string; groupId: string }> {
	const teacher = await w.freshUser({ role: 'teacher' })
	for (const roleKey of extraRoles) await addRole(teacher.id, roleKey)
	const topic = await w.freshTopic()
	await attachTopic(teacher.id, topic.id)
	const groupId = await w.freshGroup({ owner: teacher.id, members: [await ungroupedStudent()] })
	return { id: teacher.id, groupId }
}

async function expectZoneKept(teacher: { id: string; groupId: string }): Promise<void> {
	assert.equal(await topicCountOf(teacher.id), 1, 'закрепление раздела снято')
	assert.equal(await ownerOf(teacher.groupId), teacher.id, 'владелец группы снят')
}

async function expectZoneReleased(teacher: { id: string; groupId: string }): Promise<void> {
	assert.equal(await topicCountOf(teacher.id), 0, 'закрепление раздела осталось')
	assert.equal(await ownerOf(teacher.groupId), null, 'владелец группы остался')
}

async function colleagueAssignment(): Promise<{ testId: string; studentId: string }> {
	const topic = await w.freshTopic({ teacher: 'teacherA' })
	const colleague = await w.freshUser({ role: 'teacher' })
	await attachTopic(colleague.id, topic.id)
	const created = await w.freshTest(topic)
	const studentId = await ownStudent()
	await insertAssignment(created.id, studentId, colleague.id)
	return { testId: created.id, studentId }
}

const ROWS: Row[] = []

function row(profiles: ZoneProfile[], route: string, title: string, run: (profile: ZoneProfile) => Promise<void>) {
	for (const profile of profiles) ROWS.push({ profile, route, title, run })
}

function status(
	cases: Array<[ZoneProfile, number]>,
	route: string,
	request: (profile: ZoneProfile) => Promise<{ status: number; body?: unknown }>
): void {
	for (const [profile, expected] of cases) {
		ROWS.push({
			profile,
			route,
			title: String(expected),
			run: async () => expectStatus(await request(profile), expected),
		})
	}
}

const USERS_ROWS: Array<[ZoneProfile, ZoneProfile[]]> = [
	['teacherA', ['s1', 'invited']],
	['teacherB', ['s3']],
	['readUsers', []],
	['adminNoZone', []],
]

for (const [profile, expected] of USERS_ROWS) {
	row([profile], 'GET /users rows', `200, из людей мира ровно ${JSON.stringify(expected)}`, async (p) => {
		const { rows } = await listUsers(p)
		assert.deepEqual(worldPeople(rows), sorted(expected))
	})
	row([profile], 'GET /users total', 'то же множество строк и total равен числу строк ответа', async (p) => {
		const { rows, total } = await listUsers(p)
		assert.deepEqual(worldPeople(rows), sorted(expected))
		assert.equal(total, rows.length, `total ${String(total)} при ${rows.length} строках`)
	})
}
row(['readUsersAll', 'admin'], 'GET /users rows', '200, все люди мира', async (p) => {
	const { rows } = await listUsers(p)
	assert.deepEqual(worldPeople(rows), sorted(WORLD_PEOPLE))
})
row(['admin'], 'GET /users total', 'total равен числу строк при limit 500', async (p) => {
	const { rows, total } = await listUsers(p)
	assert.equal(total, rows.length, `total ${String(total)} при ${rows.length} строках`)
})
row(['admin'], 'GET /users page', '?limit=2&offset=0: 2 строки, total равен числу всех пользователей', async (p) => {
	const reply = await send(p, 'GET', '/users?limit=2&offset=0')
	expectStatus(reply, 200)
	const result = await ctx.pgPool.query<{ total: string }>('SELECT count(*)::text AS total FROM users')
	assert.equal(rowsOf(reply.body.rows, 'пользователей').length, 2)
	assert.equal(reply.body.total, Number(result.rows[0].total))
})
status([['s1', 403]], 'GET /users rows', (p) => send(p, 'GET', '/users?limit=500'))
row(['admin'], 'GET /users groups', 'у строки s1 groups содержит G и GA', async (p) => {
	const { rows } = await listUsers(p)
	const s1 = rows.find((item) => item.id === w.users.s1.id)
	assert.ok(s1, 'нет строки s1')
	const groups = rowsOf(s1.groups, 'групп s1')
	assert.deepEqual(
		keysOf(
			w.groups,
			groups.map((item) => item.id)
		),
		['G', 'GA']
	)
	for (const item of groups) assert.equal(typeof item.name, 'string', `нет name у группы ${JSON.stringify(item)}`)
})

row(['teacherA'], 'GET /users groups', 'у строки s1 groups только G: группы вне зоны не видны', async (p) => {
	const { rows } = await listUsers(p)
	const s1 = rows.find((item) => item.id === w.users.s1.id)
	assert.ok(s1, 'нет строки s1')
	const groups = rowsOf(s1.groups, 'групп s1')
	assert.deepEqual(
		groups.map((item) => item.id),
		[w.groups.G]
	)
})
row(['teacherA'], 'GET /users createdByName', 'кем создан — имя без логина', async (p) => {
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
	const invite = await send(p, 'POST', '/auth/invites', { firstName: 'Новый', groupId })
	expectStatus(invite, 200)
	const { rows } = await listUsers(p)
	const created = rows.find((item) => item.id === invite.body.userId)
	assert.ok(created, 'нет строки приглашённого')
	assert.equal(created.createdByName, `Имя ${w.prefix} teacherA Фамилия ${w.prefix} teacherA`)
})
row(['admin'], 'GET /users createdByName', 'кем создан — прежняя подпись с логином', async (p) => {
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
	const invite = await send('teacherA', 'POST', '/auth/invites', { firstName: 'Новый', groupId })
	expectStatus(invite, 200)
	const { rows } = await listUsers(p)
	const created = rows.find((item) => item.id === invite.body.userId)
	assert.ok(created, 'нет строки приглашённого')
	assert.equal(created.createdByName, w.users.teacherA.login)
})
row(
	['teacherA'],
	'GET /users staff in own group',
	'админ в группе учителя и повышенный ученик: строк нет, карточка 403',
	async (p) => {
		const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
		const invite = await send('admin', 'POST', '/auth/invites', {
			roleKey: 'admin',
			login: `${w.prefix}_staff_${Date.now()}`,
			groupId,
		})
		expectStatus(invite, 200)
		const staffId = String(invite.body.userId)
		const promoted = (await w.freshUser({ groups: [groupId] })).id
		expectStatus(await send('admin', 'PATCH', `/users/${promoted}`, { roles: ['teacher'] }), 200)
		const { rows } = await listUsers(p)
		const ids = rows.map((item) => item.id)
		assert.ok(!ids.includes(staffId), 'админ из группы учителя в списке')
		assert.ok(!ids.includes(promoted), 'повышенный ученик в списке')
		expectStatus(await send(p, 'GET', `/users/${staffId}/test-assignments`), 403)
		expectStatus(await send(p, 'GET', `/users/${promoted}/test-assignments`), 403)
	}
)

const MISSING_USER_ID = crypto.randomUUID()
const MISSING_LOGIN = 'tzusr_missing_person'

function lookupById(profile: ZoneProfile, id: string): Promise<Reply> {
	return send(profile, 'GET', `/users/${id}`)
}

function lookupByLogin(profile: ZoneProfile, login: string): Promise<Reply> {
	return send(profile, 'GET', `/users/by-login/${encodeURIComponent(login)}`)
}

async function expectListRow(profile: ZoneProfile, reply: Reply, id: string): Promise<Item> {
	expectStatus(reply, 200)
	const { rows } = await listUsers(profile)
	const expected = rows.find((item) => item.id === id)
	assert.ok(expected, `нет строки ${id} в списке ${profile}`)
	assert.deepEqual(reply.body, { user: expected })
	return expected
}

row(
	['teacherA'],
	'GET /users/:id s1 body',
	'200, тело равно строке s1 в списке учителя, группы только G',
	async (p) => {
		const user = await expectListRow(p, await lookupById(p, w.users.s1.id), w.users.s1.id)
		assert.deepEqual(
			rowsOf(user.groups, 'групп s1').map((item) => item.id),
			[w.groups.G]
		)
	}
)
row(
	['teacherA'],
	'GET /users/by-login s1 body',
	'200, тело равно строке s1 в списке учителя, группы только G',
	async (p) => {
		const user = await expectListRow(p, await lookupByLogin(p, w.users.s1.login), w.users.s1.id)
		assert.deepEqual(
			rowsOf(user.groups, 'групп s1').map((item) => item.id),
			[w.groups.G]
		)
	}
)
row(['teacherA'], 'GET /users/:id createdByName', 'кем создан — имя без логина, как в списке учителя', async (p) => {
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
	const invite = await send(p, 'POST', '/auth/invites', { firstName: 'Новый', groupId })
	expectStatus(invite, 200)
	const id = String(invite.body.userId)
	const user = await expectListRow(p, await lookupById(p, id), id)
	assert.equal(user.createdByName, `Имя ${w.prefix} teacherA Фамилия ${w.prefix} teacherA`)
})
row(['admin'], 'GET /users/:id s1 body', '200, тело равно строке s1 в списке администратора', async (p) => {
	await expectListRow(p, await lookupById(p, w.users.s1.id), w.users.s1.id)
})
status(
	[
		['adminNoZone', 403],
		['s1', 403],
		['readUsers', 403],
		['readUsersAll', 200],
	],
	'GET /users/:id s1',
	(p) => lookupById(p, w.users.s1.id)
)
status(
	[
		['adminNoZone', 403],
		['s1', 403],
		['admin', 200],
	],
	'GET /users/by-login s1',
	(p) => lookupByLogin(p, w.users.s1.login)
)
status(
	[
		['teacherA', 403],
		['teacherB', 200],
		['admin', 200],
		['readUsers', 403],
	],
	'GET /users/:id s3',
	(p) => lookupById(p, w.users.s3.id)
)
status(
	[
		['teacherA', 403],
		['teacherB', 200],
		['admin', 200],
		['readUsers', 403],
	],
	'GET /users/by-login s3',
	(p) => lookupByLogin(p, w.users.s3.login)
)
status(
	[
		['teacherA', 403],
		['readUsers', 403],
		['adminNoZone', 403],
		['admin', 404],
		['readUsersAll', 404],
	],
	'GET /users/:id missing',
	(p) => lookupById(p, MISSING_USER_ID)
)
status(
	[
		['teacherA', 403],
		['readUsers', 403],
		['adminNoZone', 403],
		['admin', 404],
		['readUsersAll', 404],
	],
	'GET /users/by-login missing',
	(p) => lookupByLogin(p, MISSING_LOGIN)
)

let sharedStudent: Promise<string> | null = null

function studentOfBothTeachers(): Promise<string> {
	sharedStudent ??= w.freshUser({ groups: [w.groups.G, w.groups.GB] }).then((user) => user.id)
	return sharedStudent
}

for (const [profile, topic] of [
	['teacherA', 'X'],
	['teacherB', 'Y'],
] as Array<[ZoneProfile, ZoneTopicKey]>) {
	row([profile], 'GET /users student of G and GB', '200 и ученик в списке', async (p) => {
		const student = await studentOfBothTeachers()
		const { rows } = await listUsers(p)
		assert.ok(
			rows.some((item) => item.id === student),
			'ученика двух учителей нет в списке'
		)
	})
	row([profile], 'GET /users/:shared/test-assignments', '200', async (p) => {
		expectStatus(await send(p, 'GET', `/users/${await studentOfBothTeachers()}/test-assignments`), 200)
	})
	row([profile], 'DELETE /users/:shared/login-throttle', '200', async (p) => {
		expectStatus(await send(p, 'DELETE', `/users/${await studentOfBothTeachers()}/login-throttle`), 200)
	})
	row([profile], `POST /users/:shared/test-assignments fresh${topic}`, '200 и назначение есть', async (p) => {
		const student = await studentOfBothTeachers()
		const created = await freshTestOf(topic)
		expectStatus(await send(p, 'POST', `/users/${student}/test-assignments`, { testId: created.id }), 200)
		assert.equal(await assignmentExists(created.id, student), true)
	})
}

const S2_ATTEMPTS: Array<[ZoneProfile, ZoneAttemptKey[]]> = [
	['teacherA', ['s2X']],
	['teacherB', ['s2Y']],
	['admin', ['s2X', 's2Y']],
]
for (const [profile, expected] of S2_ATTEMPTS) {
	row([profile], 'GET /users/:s2/test-attempts', `200, попытки мира ${JSON.stringify(expected)}`, async (p) => {
		const reply = await send(p, 'GET', `/users/${w.users.s2.id}/test-attempts`)
		expectStatus(reply, 200)
		assert.deepEqual(worldAttempts(rowsOf(reply.body.attempts, 'попыток')), expected)
	})
}
status([['s1', 403]], 'GET /users/:s2/test-attempts', (p) => send(p, 'GET', `/users/${w.users.s2.id}/test-attempts`))
row(['teacherA'], 'GET /users/:teacherA/test-attempts', '200 без строк: попытки персонала не отдаются', async (p) => {
	const reply = await send(p, 'GET', `/users/${w.users.teacherA.id}/test-attempts`)
	expectStatus(reply, 200)
	assert.deepEqual(rowsOf(reply.body.attempts, 'попыток'), [])
})
row(['admin'], 'GET /users/:teacherA/test-attempts', '200 с попыткой teacherAX', async (p) => {
	const reply = await send(p, 'GET', `/users/${w.users.teacherA.id}/test-attempts`)
	expectStatus(reply, 200)
	assert.deepEqual(worldAttempts(rowsOf(reply.body.attempts, 'попыток')), ['teacherAX'])
})

row(['teacherA'], 'GET /users/:s1/test-assignments', '200 tX и tX2, canUnassign tX true и tX2 false', async (p) => {
	const reply = await send(p, 'GET', `/users/${w.users.s1.id}/test-assignments`)
	expectStatus(reply, 200)
	const list = rowsOf(reply.body.assignments, 'назначений')
	assert.deepEqual(worldTests(list), ['tX', 'tX2'])
	assert.equal(list.find((item) => item.testId === w.tests.tX.id)?.canUnassign, true)
	assert.equal(list.find((item) => item.testId === w.tests.tX2.id)?.canUnassign, false)
})
row(['admin'], 'GET /users/:s1/test-assignments', '200 tX и tX2, у всех строк canUnassign true', async (p) => {
	const reply = await send(p, 'GET', `/users/${w.users.s1.id}/test-assignments`)
	expectStatus(reply, 200)
	const list = rowsOf(reply.body.assignments, 'назначений')
	assert.deepEqual(worldTests(list), ['tX', 'tX2'])
	for (const item of list) assert.equal(item.canUnassign, true, `canUnassign у ${String(item.testId)}`)
})
status([['teacherB', 403]], 'GET /users/:s1/test-assignments', (p) =>
	send(p, 'GET', `/users/${w.users.s1.id}/test-assignments`)
)
status([['teacherA', 403]], 'GET /users/:s2/test-assignments', (p) =>
	send(p, 'GET', `/users/${w.users.s2.id}/test-assignments`)
)
row(
	['teacherA'],
	'GET /users/:own/test-assignments colleague',
	'200, назначение коллеги видно, canUnassign false',
	async (p) => {
		const { testId, studentId } = await colleagueAssignment()
		const reply = await send(p, 'GET', `/users/${studentId}/test-assignments`)
		expectStatus(reply, 200)
		const item = rowsOf(reply.body.assignments, 'назначений').find((entry) => entry.testId === testId)
		assert.ok(item, 'назначения коллеги нет')
		assert.equal(item.canUnassign, false)
	}
)
row(['teacherA'], 'DELETE /users/:own/test-assignments/:fresh colleague', '403 и назначение на месте', async (p) => {
	const { testId, studentId } = await colleagueAssignment()
	expectStatus(await send(p, 'DELETE', `/users/${studentId}/test-assignments/${testId}`), 403)
	assert.equal(await assignmentExists(testId, studentId), true)
})

row(['teacherA'], 'POST /users/:own/test-assignments tY', '403 и назначения tY нет', async (p) => {
	const student = await ownStudent()
	expectStatus(await send(p, 'POST', `/users/${student}/test-assignments`, { testId: w.tests.tY.id }), 403)
	assert.equal(await assignmentExists(w.tests.tY.id, student), false)
})
row(['teacherA'], 'POST /users/:own/test-assignments freshX', '200 и назначение есть', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/users/${student}/test-assignments`, { testId: created.id }), 200)
	assert.equal(await assignmentExists(created.id, student), true)
})
row(['teacherA'], 'POST /users/:ungrouped/test-assignments freshX', '403 и назначения нет', async (p) => {
	const student = await ungroupedStudent()
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/users/${student}/test-assignments`, { testId: created.id }), 403)
	assert.equal(await assignmentExists(created.id, student), false)
})

row(['teacherA'], 'DELETE /users/:own/test-assignments/:freshX by teacherA', '200 и назначение снято', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('X')
	await insertAssignment(created.id, student, w.users.teacherA.id)
	expectStatus(await send(p, 'DELETE', `/users/${student}/test-assignments/${created.id}`), 200)
	assert.equal(await assignmentExists(created.id, student), false)
})
row(['teacherA'], 'DELETE /users/:own/test-assignments/:freshX by admin', '403 и назначение на месте', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('X')
	await insertAssignment(created.id, student, w.users.admin.id)
	expectStatus(await send(p, 'DELETE', `/users/${student}/test-assignments/${created.id}`), 403)
	assert.equal(await assignmentExists(created.id, student), true)
})

row(
	['teacherA'],
	'GET /api/tests/:tX/assignments',
	'200, s1 с login и canUnassign true, s2 без login и canUnassign false',
	async (p) => {
		const reply = await send(p, 'GET', `/tests/${w.tests.tX.id}/assignments`)
		expectStatus(reply, 200)
		const list = rowsOf(reply.body.assignments, 'назначений')
		const s1 = list.find((item) => item.userId === w.users.s1.id)
		const s2 = list.find((item) => item.userId === w.users.s2.id)
		assert.ok(s1 && s2, 'нет строк s1 или s2')
		assert.equal(s1.login, w.users.s1.login)
		assert.equal(s1.canUnassign, true)
		assert.ok(!('login' in s2), `у s2 есть login ${String(s2.login)}`)
		assert.equal(s2.canUnassign, false)
	}
)
row(['admin'], 'GET /api/tests/:tX/assignments', '200, есть s1 и s2', async (p) => {
	const reply = await send(p, 'GET', `/tests/${w.tests.tX.id}/assignments`)
	expectStatus(reply, 200)
	const ids = rowsOf(reply.body.assignments, 'назначений').map((item) => item.userId)
	assert.ok(ids.includes(w.users.s1.id) && ids.includes(w.users.s2.id), JSON.stringify(ids))
})
status([['teacherB', 403]], 'GET /api/tests/:tX/assignments', (p) =>
	send(p, 'GET', `/tests/${w.tests.tX.id}/assignments`)
)

row(['teacherA'], 'POST /api/tests/:freshX/assignments own', '200 и назначение есть', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments`, { userId: student }), 200)
	assert.equal(await assignmentExists(created.id, student), true)
})
row(['teacherA'], 'POST /api/tests/:freshX/assignments ungrouped', '403 и назначения нет', async (p) => {
	const student = await ungroupedStudent()
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments`, { userId: student }), 403)
	assert.equal(await assignmentExists(created.id, student), false)
})
row(['teacherA'], 'POST /api/tests/:freshY/assignments own', '403 и назначения нет', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('Y')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments`, { userId: student }), 403)
	assert.equal(await assignmentExists(created.id, student), false)
})

row(['teacherA'], 'POST /api/tests/:freshX/assignments/group/:own', '200 и ученик группы назначен', async (p) => {
	const student = await ungroupedStudent()
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members: [student] })
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments/group/${groupId}`), 200)
	assert.equal(await assignmentExists(created.id, student), true)
})
row(['teacherA'], 'POST /api/tests/:freshX/assignments/group/:teacherB', '403 и назначения нет', async (p) => {
	const student = await ungroupedStudent()
	const groupId = await w.freshGroup({ owner: w.users.teacherB.id, members: [student] })
	const created = await freshTestOf('X')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments/group/${groupId}`), 403)
	assert.equal(await assignmentExists(created.id, student), false)
})
row(['teacherA'], 'POST /api/tests/:freshY/assignments/group/:own', '403 и назначения нет', async (p) => {
	const student = await ungroupedStudent()
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members: [student] })
	const created = await freshTestOf('Y')
	expectStatus(await send(p, 'POST', `/tests/${created.id}/assignments/group/${groupId}`), 403)
	assert.equal(await assignmentExists(created.id, student), false)
})

async function denyGrant(userId: string, key: string): Promise<void> {
	const [domain, action] = key.split('.')
	await ctx.pgPool.query('INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, $2, $3, false)', [
		userId,
		domain,
		action,
	])
}

row(
	['teacherA'],
	'POST /api/tests/:fresh/assignments/group/:own deny manage_assignments',
	'403 учителю с запретом tests.manage_assignments и назначения нет',
	async () => {
		const teacher = await w.freshUser({ role: 'teacher' })
		const topic = await w.freshTopic()
		await attachTopic(teacher.id, topic.id)
		await denyGrant(teacher.id, 'tests.manage_assignments')
		const student = await ungroupedStudent()
		const groupId = await w.freshGroup({ owner: teacher.id, members: [student] })
		const created = await w.freshTest(topic)
		const reply = await call(ctx, 'POST', `/api/tests/${created.id}/assignments/group/${groupId}`, {
			cookies: teacher.cookie,
		})
		expectStatus(reply, 403)
		assert.equal(await assignmentExists(created.id, student), false)
	}
)
row(
	['teacherA'],
	'POST /api/tests/:freshX/assignments/group/:own with staff',
	'200, ученик назначен, персоналу в группе назначения нет',
	async (p) => {
		const student = await ungroupedStudent()
		const staff = (await w.freshUser({ role: 'admin' })).id
		const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members: [student] })
		await ctx.db.insert(ctx.schema.userGroups).values({ groupId, userId: staff })
		const created = await freshTestOf('X')
		const reply = await send(p, 'POST', `/tests/${created.id}/assignments/group/${groupId}`)
		expectStatus(reply, 200)
		assert.equal(reply.body.assigned, 1)
		assert.equal(await assignmentExists(created.id, student), true)
		assert.equal(await assignmentExists(created.id, staff), false)
	}
)

row(
	['teacherA'],
	'DELETE /api/tests/:freshX/assignments/:ungrouped by admin',
	'403 и назначение на месте',
	async (p) => {
		const student = await ungroupedStudent()
		const created = await freshTestOf('X')
		await insertAssignment(created.id, student, w.users.admin.id)
		expectStatus(await send(p, 'DELETE', `/tests/${created.id}/assignments/${student}`), 403)
		assert.equal(await assignmentExists(created.id, student), true)
	}
)
row(['teacherA'], 'DELETE /api/tests/:freshX/assignments/:own by teacherA', '200 и назначение снято', async (p) => {
	const student = await ownStudent()
	const created = await freshTestOf('X')
	await insertAssignment(created.id, student, w.users.teacherA.id)
	expectStatus(await send(p, 'DELETE', `/tests/${created.id}/assignments/${student}`), 200)
	assert.equal(await assignmentExists(created.id, student), false)
})

row(['admin'], 'PATCH /users/:fresh/group groupIds', '200 и членства ровно G и GA', async (p) => {
	const student = await ownStudent()
	expectStatus(await send(p, 'PATCH', `/users/${student}/group`, { groupIds: [w.groups.G, w.groups.GA] }), 200)
	assert.deepEqual(await groupsOf(student), ['G', 'GA'])
})
row(['admin'], 'PATCH /users/:fresh/group groupId', '200 и членства ровно G (прежнее тело)', async (p) => {
	const student = (await w.freshUser({ groups: [w.groups.G, w.groups.GA] })).id
	expectStatus(await send(p, 'PATCH', `/users/${student}/group`, { groupId: w.groups.G }), 200)
	assert.deepEqual(await groupsOf(student), ['G'])
})
row(['admin'], 'PATCH /users/:teacher group G', '400 и учитель не в группе учителя', async (p) => {
	const teacher = await w.freshUser({ role: 'teacher' })
	expectStatus(await send(p, 'PATCH', `/users/${teacher.id}/group`, { groupIds: [w.groups.G] }), 400)
	assert.deepEqual(await groupsOf(teacher.id), [])
})
row(['teacherA'], 'PATCH /users/:own/group', '403 и членства не изменились', async (p) => {
	const student = await ownStudent()
	expectStatus(await send(p, 'PATCH', `/users/${student}/group`, { groupIds: [w.groups.G, w.groups.GA] }), 403)
	assert.deepEqual(await groupsOf(student), ['G'])
})

row(['admin'], 'PATCH /users/:teacher isActive false', '200 и зона учителя освобождена', async (p) => {
	const teacher = await zoneTeacher()
	expectStatus(await send(p, 'PATCH', `/users/${teacher.id}`, { isActive: false }), 200)
	await expectZoneReleased(teacher)
})
row(['admin'], 'PATCH /users/:teacher roles user', '200 и зона учителя освобождена', async (p) => {
	const teacher = await zoneTeacher()
	expectStatus(await send(p, 'PATCH', `/users/${teacher.id}`, { roles: ['user'] }), 200)
	await expectZoneReleased(teacher)
})
row(['admin'], 'PATCH /users/:teacher roles teacher user', '200 и зона на месте', async (p) => {
	const teacher = await zoneTeacher()
	expectStatus(await send(p, 'PATCH', `/users/${teacher.id}`, { roles: ['teacher', 'user'] }), 200)
	await expectZoneKept(teacher)
})
row(
	['admin'],
	'PATCH /users/:teacher roles admin',
	'200 и зона освобождена: в наборе нет роли с ownsZone',
	async (p) => {
		const teacher = await zoneTeacher()
		expectStatus(await send(p, 'PATCH', `/users/${teacher.id}`, { roles: ['admin'] }), 200)
		await expectZoneReleased(teacher)
	}
)
row(['admin'], 'PATCH /users/:teacher phone', '200, роли и зона на месте', async (p) => {
	const teacher = await zoneTeacher(['user'])
	expectStatus(await send(p, 'PATCH', `/users/${teacher.id}`, { phone: '+70000000000' }), 200)
	assert.deepEqual(await rolesOf(teacher.id), ['teacher', 'user'])
	await expectZoneKept(teacher)
})

beforeAll(async () => {
	ctx = await startAuthApp('test_tz_users')
	w = await seedTeacherZoneWorld(ctx, 'tzusr')
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('матрица зоны учителя: ученики и назначения', () => {
	const seen = new Set<string>()
	for (const item of ROWS) {
		const id = `${item.profile} ${item.route}`
		assert.ok(!seen.has(id), `повтор id ${id}`)
		seen.add(id)
		check(id, item.title, () => item.run(item.profile))
	}
	for (const id of KNOWN_DEFECTS) assert.ok(seen.has(id), `KNOWN_DEFECTS без строки ${id}`)
})
