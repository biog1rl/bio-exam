import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type TeacherZoneWorld,
	type ZoneGroupKey,
	type ZoneProfile,
} from '../../test-support/teacher-zone-world.js'

const KNOWN_DEFECTS = new Set<string>([])

function check(id: string, title: string, fn: () => Promise<void>): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn)
}

type Row = { profile: ZoneProfile; route: string; title: string; run: (profile: ZoneProfile) => Promise<void> }

const CANDIDATE_KEYS = ['avatarColor', 'avatarCropped', 'firstName', 'id', 'initials', 'lastName', 'name']

let ctx: AuthApp
let w: TeacherZoneWorld

function send(profile: ZoneProfile, method: string, path: string, body?: unknown): Promise<Reply> {
	return call(ctx, method, `/api/groups${path}`, { cookies: w.users[profile].cookie, body })
}

function expectStatus(reply: { status: number; body?: unknown }, status: number): void {
	assert.equal(reply.status, status, `ожидался ${status}, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
}

function rowsOf(list: unknown, name: string): Array<Record<string, unknown>> {
	assert.ok(Array.isArray(list), `нет списка ${name}`)
	return list as Array<Record<string, unknown>>
}

function groupKeys(list: unknown): ZoneGroupKey[] {
	const byId = new Map(Object.entries(w.groups).map(([key, id]) => [id, key as ZoneGroupKey]))
	return rowsOf(list, 'групп')
		.map((item) => byId.get(String(item.id)))
		.filter((key): key is ZoneGroupKey => key !== undefined)
		.sort()
}

function personId(value: unknown): string | null {
	if (value === null || value === undefined) return null
	if (typeof value === 'string') return value
	const id = (value as { id?: unknown }).id
	return typeof id === 'string' ? id : null
}

function uniqueName(): string {
	return `Группа ${w.prefix} ${crypto.randomUUID().slice(0, 8)}`
}

async function ownerOf(groupId: string): Promise<string | null> {
	const result = await ctx.pgPool.query<{ owner_id: string | null }>(
		'SELECT owner_id FROM student_groups WHERE id = $1',
		[groupId]
	)
	assert.ok(result.rows[0], `группа ${groupId} не найдена`)
	return result.rows[0].owner_id
}

async function membersOf(groupId: string): Promise<string[]> {
	const result = await ctx.pgPool.query<{ user_id: string }>(
		'SELECT user_id FROM user_groups WHERE group_id = $1 ORDER BY user_id',
		[groupId]
	)
	return result.rows.map((item) => item.user_id)
}

async function groupExists(groupId: string): Promise<boolean> {
	const result = await ctx.pgPool.query('SELECT 1 FROM student_groups WHERE id = $1', [groupId])
	return (result.rowCount ?? 0) > 0
}

async function groupByName(name: string): Promise<string | null> {
	const result = await ctx.pgPool.query<{ id: string }>('SELECT id FROM student_groups WHERE name = $1', [name])
	return result.rows[0]?.id ?? null
}

async function expectNoGroup(name: string): Promise<void> {
	assert.equal(await groupByName(name), null, `группа ${name} создана`)
}

function createdId(reply: Reply): string {
	const group = reply.body.group as { id?: unknown } | undefined
	assert.ok(group && typeof group.id === 'string', `нет group.id: ${JSON.stringify(reply.body)}`)
	return group.id
}

async function studentId(): Promise<string> {
	return (await w.freshUser()).id
}

async function teacherId(): Promise<string> {
	return (await w.freshUser({ role: 'teacher' })).id
}

async function deactivatedId(): Promise<string> {
	return (await w.freshUser({ isActive: false, activated: true })).id
}

async function teacherAGroupWithStudent(): Promise<{ groupId: string; members: string[] }> {
	const members = [await studentId()]
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members })
	return { groupId, members }
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

row(['s1'], 'GET /api/groups/my', '200, groups содержит G и GA, group одна из них', async (p) => {
	const reply = await send(p, 'GET', '/my')
	expectStatus(reply, 200)
	assert.deepEqual(groupKeys(reply.body.groups), ['G', 'GA'])
	const one = personId(reply.body.group)
	assert.ok(one === w.groups.G || one === w.groups.GA, `group ${JSON.stringify(reply.body.group)}`)
})
row(['s2'], 'GET /api/groups/my', '200, groups пуст и group null', async (p) => {
	const reply = await send(p, 'GET', '/my')
	expectStatus(reply, 200)
	assert.deepEqual(reply.body.groups, [])
	assert.equal(reply.body.group, null)
})

row(['admin'], 'GET /api/groups', '200 G GB GA с owner и memberCount', async (p) => {
	const reply = await send(p, 'GET', '')
	expectStatus(reply, 200)
	assert.deepEqual(groupKeys(reply.body.groups), ['G', 'GA', 'GB'])
	const byId = new Map(rowsOf(reply.body.groups, 'групп').map((item) => [String(item.id), item]))
	const g = byId.get(w.groups.G)
	const gb = byId.get(w.groups.GB)
	const ga = byId.get(w.groups.GA)
	assert.ok(g && gb && ga)
	assert.ok('owner' in g && 'owner' in gb && 'owner' in ga, 'нет поля owner')
	assert.equal(personId(g.owner), w.users.teacherA.id)
	assert.equal(personId(gb.owner), w.users.teacherB.id)
	assert.equal(ga.owner, null)
	assert.equal(g.memberCount, 2)
	assert.equal(gb.memberCount, 1)
	assert.equal(ga.memberCount, 1)
})
row(['teacherA'], 'GET /api/groups', '200, из групп мира только G, memberCount 2', async (p) => {
	const reply = await send(p, 'GET', '')
	expectStatus(reply, 200)
	assert.deepEqual(groupKeys(reply.body.groups), ['G'])
	const g = rowsOf(reply.body.groups, 'групп').find((item) => item.id === w.groups.G)
	assert.equal(g?.memberCount, 2)
})
row(['teacherB'], 'GET /api/groups', '200, из групп мира только GB', async (p) => {
	const reply = await send(p, 'GET', '')
	expectStatus(reply, 200)
	assert.deepEqual(groupKeys(reply.body.groups), ['GB'])
})
status([['s1', 403]], 'GET /api/groups', (p) => send(p, 'GET', ''))
row(['adminNoZone'], 'GET /api/groups', '200 пустой список', async (p) => {
	const reply = await send(p, 'GET', '')
	expectStatus(reply, 200)
	assert.deepEqual(reply.body.groups, [])
})

row(['teacherA'], 'GET /api/groups/:G', '200, members s1 и invited, у invited isActive false', async (p) => {
	const reply = await send(p, 'GET', `/${w.groups.G}`)
	expectStatus(reply, 200)
	const group = reply.body.group as { members?: unknown }
	const members = rowsOf(group?.members, 'участников')
	const ids = members.map((item) => String(item.id)).sort()
	assert.deepEqual(ids, [w.users.s1.id, w.users.invited.id].sort())
	const invited = members.find((item) => item.id === w.users.invited.id)
	assert.equal(invited?.isActive, false)
	const s1 = members.find((item) => item.id === w.users.s1.id)
	assert.equal(s1?.isActive, true)
})
status(
	[
		['teacherB', 403],
		['admin', 200],
	],
	'GET /api/groups/:G',
	(p) => send(p, 'GET', `/${w.groups.G}`)
)
status(
	[
		['admin', 404],
		['teacherA', 403],
	],
	'GET /api/groups/:missing',
	(p) => send(p, 'GET', `/${crypto.randomUUID()}`)
)

row(['teacherA'], 'POST /api/groups', '201, владелец teacherA, ученик в составе', async (p) => {
	const member = await studentId()
	const reply = await send(p, 'POST', '', { name: uniqueName(), memberIds: [member] })
	expectStatus(reply, 201)
	const id = createdId(reply)
	assert.equal(await ownerOf(id), w.users.teacherA.id)
	assert.deepEqual(await membersOf(id), [member])
})
row(['teacherA'], 'POST /api/groups ownerId teacherB', '403 и группа не создана', async (p) => {
	const name = uniqueName()
	expectStatus(await send(p, 'POST', '', { name, memberIds: [], ownerId: w.users.teacherB.id }), 403)
	await expectNoGroup(name)
})
row(['teacherA'], 'POST /api/groups member teacher', '400 и группа не создана', async (p) => {
	const name = uniqueName()
	expectStatus(await send(p, 'POST', '', { name, memberIds: [await teacherId()] }), 400)
	await expectNoGroup(name)
})
row(['teacherA'], 'POST /api/groups member allow tests.read', '400 «Ученик» с allow-переопределением', async (p) => {
	const name = uniqueName()
	const person = await w.freshUser({ allow: ['tests.read'] })
	expectStatus(await send(p, 'POST', '', { name, memberIds: [person.id] }), 400)
	await expectNoGroup(name)
})
row(['teacherA'], 'POST /api/groups member deactivated', '400 деактивированный ученик', async (p) => {
	const name = uniqueName()
	expectStatus(await send(p, 'POST', '', { name, memberIds: [await deactivatedId()] }), 400)
	await expectNoGroup(name)
})
row(
	['teacherA'],
	'POST /api/groups member invited',
	'201 свой приглашённый из другой своей группы, ещё не активирован',
	async (p) => {
		const person = await w.freshUser({ isActive: false, activated: false })
		await w.freshGroup({ owner: w.users.teacherA.id, members: [person.id] })
		const reply = await send(p, 'POST', '', { name: uniqueName(), memberIds: [person.id] })
		expectStatus(reply, 201)
		assert.deepEqual(await membersOf(createdId(reply)), [person.id])
	}
)
row(
	['teacherA'],
	'POST /api/groups member invited outside zone',
	'400 приглашённый без групп учителя и группа не создана',
	async (p) => {
		const name = uniqueName()
		const person = await w.freshUser({ isActive: false, activated: false })
		expectStatus(await send(p, 'POST', '', { name, memberIds: [person.id] }), 400)
		await expectNoGroup(name)
	}
)
row(
	['teacherB'],
	'POST /api/groups member invited of teacherA',
	'400 чужой приглашённый и группа не создана',
	async (p) => {
		const name = uniqueName()
		expectStatus(await send(p, 'POST', '', { name, memberIds: [w.users.invited.id] }), 400)
		await expectNoGroup(name)
		assert.deepEqual(await membersOf(w.groups.G), [w.users.s1.id, w.users.invited.id].sort())
	}
)
row(
	['teacherB'],
	'PATCH /api/groups/:freshB member invited of teacherA',
	'400 чужой приглашённый и состав не изменился',
	async (p) => {
		const members = [await studentId()]
		const groupId = await w.freshGroup({ owner: w.users.teacherB.id, members })
		expectStatus(await send(p, 'PATCH', `/${groupId}`, { memberIds: [...members, w.users.invited.id] }), 400)
		assert.deepEqual(await membersOf(groupId), members)
	}
)
row(
	['teacherB'],
	'PATCH /api/groups/:freshB member invited by admin',
	'400 приглашённый админом без группы и состав не изменился',
	async (p) => {
		const members = [await studentId()]
		const groupId = await w.freshGroup({ owner: w.users.teacherB.id, members })
		const person = await w.freshUser({ isActive: false, activated: false })
		expectStatus(await send(p, 'PATCH', `/${groupId}`, { memberIds: [...members, person.id] }), 400)
		assert.deepEqual(await membersOf(groupId), members)
	}
)
row(
	['teacherA'],
	'PATCH /api/groups/:fresh own invited kept',
	'200 переименование группы со своим приглашённым',
	async (p) => {
		const person = await w.freshUser({ isActive: false, activated: false })
		const groupId = await w.freshGroup({ owner: w.users.teacherA.id, members: [person.id] })
		const name = uniqueName()
		expectStatus(await send(p, 'PATCH', `/${groupId}`, { name, memberIds: [person.id] }), 200)
		assert.equal(await groupByName(name), groupId)
		assert.deepEqual(await membersOf(groupId), [person.id])
	}
)
row(['admin'], 'POST /api/groups ownerId teacher', '201 и владелец — учитель', async (p) => {
	const owner = await teacherId()
	const reply = await send(p, 'POST', '', { name: uniqueName(), memberIds: [], ownerId: owner })
	expectStatus(reply, 201)
	assert.equal(await ownerOf(createdId(reply)), owner)
})
row(['admin'], 'POST /api/groups ownerId teacher member teacher', '400 персонал в группе учителя', async (p) => {
	const name = uniqueName()
	const owner = await teacherId()
	expectStatus(await send(p, 'POST', '', { name, memberIds: [await teacherId()], ownerId: owner }), 400)
	await expectNoGroup(name)
})
row(['admin'], 'POST /api/groups ownerId s1', '400 ученик не владелец', async (p) => {
	const name = uniqueName()
	expectStatus(await send(p, 'POST', '', { name, memberIds: [], ownerId: w.users.s1.id }), 400)
	await expectNoGroup(name)
})
row(['admin'], 'POST /api/groups', '201 без владельца', async (p) => {
	const reply = await send(p, 'POST', '', { name: uniqueName(), memberIds: [] })
	expectStatus(reply, 201)
	assert.equal(await ownerOf(createdId(reply)), null)
})

row(['teacherA'], 'PATCH /api/groups/:fresh name', '200 правка названия своей группы', async (p) => {
	const { groupId } = await teacherAGroupWithStudent()
	const name = uniqueName()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { name }), 200)
	assert.equal(await groupByName(name), groupId)
})
row(['teacherA'], 'PATCH /api/groups/:fresh member teacher', '400 и состав не изменился', async (p) => {
	const { groupId, members } = await teacherAGroupWithStudent()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { memberIds: [...members, await teacherId()] }), 400)
	assert.deepEqual(await membersOf(groupId), members)
})
row(['teacherA'], 'PATCH /api/groups/:fresh member deactivated', '400 и состав не изменился', async (p) => {
	const { groupId, members } = await teacherAGroupWithStudent()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { memberIds: [...members, await deactivatedId()] }), 400)
	assert.deepEqual(await membersOf(groupId), members)
})
row(['teacherA'], 'PATCH /api/groups/:fresh ownerId', '403 и владелец не изменился', async (p) => {
	const { groupId } = await teacherAGroupWithStudent()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { ownerId: w.users.teacherB.id }), 403)
	assert.equal(await ownerOf(groupId), w.users.teacherA.id)
})
row(['teacherB'], 'PATCH /api/groups/:fresh', '403 на группу teacherA', async (p) => {
	const { groupId } = await teacherAGroupWithStudent()
	const name = uniqueName()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { name }), 403)
	assert.equal(await groupByName(name), null)
})
row(['admin'], 'PATCH /api/groups/:fresh ownerId teacher', '200 и владелец сменился', async (p) => {
	const groupId = await w.freshGroup({ owner: null, members: [await studentId()] })
	const owner = await teacherId()
	expectStatus(await send(p, 'PATCH', `/${groupId}`, { ownerId: owner }), 200)
	assert.equal(await ownerOf(groupId), owner)
})
row(
	['admin'],
	'PATCH /api/groups/:fresh ownerId teacher member teacher',
	'400 персонал в группе учителя, владелец не изменился',
	async (p) => {
		const groupId = await w.freshGroup({ owner: null, members: [await teacherId()] })
		const owner = await teacherId()
		expectStatus(await send(p, 'PATCH', `/${groupId}`, { ownerId: owner }), 400)
		assert.equal(await ownerOf(groupId), null)
	}
)

row(
	['admin'],
	'PATCH /api/groups/:fresh member teacher',
	'400 персонал в группе учителя, состав не изменился',
	async (p) => {
		const { groupId, members } = await teacherAGroupWithStudent()
		expectStatus(await send(p, 'PATCH', `/${groupId}`, { memberIds: [...members, await teacherId()] }), 400)
		assert.deepEqual(await membersOf(groupId), members)
		assert.equal(await ownerOf(groupId), w.users.teacherA.id)
	}
)

row(['teacherA'], 'DELETE /api/groups/:fresh', '200 и группа удалена', async (p) => {
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
	expectStatus(await send(p, 'DELETE', `/${groupId}`), 200)
	assert.equal(await groupExists(groupId), false)
})
row(['teacherB'], 'DELETE /api/groups/:fresh', '403 и группа на месте', async (p) => {
	const groupId = await w.freshGroup({ owner: w.users.teacherA.id })
	expectStatus(await send(p, 'DELETE', `/${groupId}`), 403)
	assert.equal(await groupExists(groupId), true)
})

row(
	['teacherA'],
	'GET /api/groups/candidates',
	'200 активные ученики без персонала и allow-переопределений, ровно ключи DTO',
	async (p) => {
		const reply = await send(p, 'GET', `/candidates?q=${encodeURIComponent(w.prefix)}`)
		expectStatus(reply, 200)
		const list = rowsOf(reply.body.users, 'кандидатов')
		const ids = new Set(list.map((item) => String(item.id)))
		for (const profile of ['s1', 's2', 's3'] as ZoneProfile[]) {
			assert.ok(ids.has(w.users[profile].id), `${profile} нет в кандидатах`)
		}
		for (const profile of ['teacherB', 'admin', 'invited', 'readTests', 'readUsers'] as ZoneProfile[]) {
			assert.ok(!ids.has(w.users[profile].id), `${profile} в кандидатах`)
		}
		for (const item of list) assert.deepEqual(Object.keys(item).sort(), CANDIDATE_KEYS)
	}
)
status([['teacherA', 400]], 'GET /api/groups/candidates q one char', (p) => send(p, 'GET', '/candidates?q=t'))
status([['s1', 403]], 'GET /api/groups/candidates', (p) =>
	send(p, 'GET', `/candidates?q=${encodeURIComponent(w.prefix)}`)
)

row(['admin'], 'GET /api/groups/owner-options', '200, есть teacherA и teacherB, нет teacherOff и s1', async (p) => {
	const reply = await send(p, 'GET', '/owner-options')
	expectStatus(reply, 200)
	const ids = new Set(rowsOf(reply.body.owners, 'владельцев').map((item) => personId(item)))
	assert.ok(ids.has(w.users.teacherA.id), 'teacherA нет')
	assert.ok(ids.has(w.users.teacherB.id), 'teacherB нет')
	assert.ok(!ids.has(w.users.teacherOff.id), 'teacherOff есть')
	assert.ok(!ids.has(w.users.s1.id), 's1 есть')
})
status([['teacherA', 403]], 'GET /api/groups/owner-options', (p) => send(p, 'GET', '/owner-options'))

beforeAll(async () => {
	ctx = await startAuthApp('test_tz_groups')
	w = await seedTeacherZoneWorld(ctx, 'tzgrp')
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('матрица зоны учителя: группы', () => {
	const seen = new Set<string>()
	for (const item of ROWS) {
		const id = `${item.profile} ${item.route}`
		assert.ok(!seen.has(id), `повтор id ${id}`)
		seen.add(id)
		check(id, item.title, () => item.run(item.profile))
	}
	for (const id of KNOWN_DEFECTS) assert.ok(seen.has(id), `KNOWN_DEFECTS без строки ${id}`)
})
