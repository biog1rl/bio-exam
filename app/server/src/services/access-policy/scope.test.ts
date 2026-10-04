import { ROLE_REGISTRY, STUDENT_ROLE_KEY, type PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'
import { describe, expect, test } from 'vitest'

import { createAccessScope, type AccessScope } from './scope-rules.js'
import { createInMemoryZoneLoader, type ZoneLoader, type ZoneSnapshot } from './zone-loader.js'

const req = {} as Request

function scopeWith(granted: PermissionKey[]) {
	const asked: PermissionKey[] = []
	const scope = createAccessScope(async (_req, key) => {
		asked.push(key)
		return granted.includes(key)
	}, createInMemoryZoneLoader({}))
	return { scope, asked }
}

describe('createAccessScope', () => {
	test.each([
		{ name: 'canReadTest', key: 'tests.read', call: (s: AccessScope) => s.canReadTest(req, 't1') },
		{ name: 'canWriteTest', key: 'tests.write', call: (s: AccessScope) => s.canWriteTest(req, 't1') },
		{ name: 'canWriteTopic', key: 'tests.write', call: (s: AccessScope) => s.canWriteTopic(req, 'p1') },
		{ name: 'canReadUser', key: 'users.read', call: (s: AccessScope) => s.canReadUser(req, 'u1') },
		{ name: 'canReviewAttempt', key: 'tests.read', call: (s: AccessScope) => s.canReviewAttempt(req, 'a1') },
	] as const)('$name разрешает только при $key', async ({ key, call }) => {
		const allowed = scopeWith([key])
		expect(await call(allowed.scope)).toBe(true)
		expect(allowed.asked).toEqual([key])

		const denied = scopeWith([])
		expect(await call(denied.scope)).toBe(false)
	})

	test('testScope при tests.read — все тесты', async () => {
		const { scope } = scopeWith(['tests.read'])
		expect(await scope.testScope(req)).toEqual({ all: true })
	})

	test('testScope без tests.read — пустой список тем', async () => {
		const { scope } = scopeWith(['tests.write', 'users.read'])
		expect(await scope.testScope(req)).toEqual({ all: false, topicIds: [] })
	})

	test('ошибка проверки прав пробрасывается, доступ не выдаётся', async () => {
		const scope = createAccessScope(async () => {
			throw new Error('grants unavailable')
		}, createInMemoryZoneLoader({}))
		await expect(scope.canReadTest(req, 't1')).rejects.toThrow('grants unavailable')
		await expect(scope.testScope(req)).rejects.toThrow('grants unavailable')
	})
})

const A = 'teacher-a'
const B = 'teacher-b'
const S = 'student-s'
const S2 = 'student-outside'
const T = 'teacher-in-group'
const M = 'methodist-in-group'
const X = 'topic-x'
const Y = 'topic-y'
const G = 'group-g'
const GB = 'group-gb'
const GA = 'group-admins'
const tX = 'test-x'
const tX2 = 'test-x2'
const tY = 'test-y'

const STUDENT = STUDENT_ROLE_KEY
const STAFF = ROLE_REGISTRY.teacher.key

const WORLD: ZoneSnapshot = {
	teacherTopics: { [A]: [X], [B]: [Y] },
	groups: [
		{ id: G, ownerId: A, members: [S, T, M] },
		{ id: GB, ownerId: B, members: [S2] },
		{ id: GA, ownerId: null, members: [S2] },
	],
	tests: { [tX]: X, [tX2]: X, [tY]: Y },
	attempts: { 'attempt-x': tX },
	roleKeysByUser: { [S]: [STUDENT], [S2]: [STUDENT], [T]: [STAFF], [M]: [STUDENT], [A]: [STAFF], [B]: [STAFF] },
	usersWithAllowGrants: [M],
}

function userReq(userId: string): Request {
	return { authUser: { id: userId, sessionId: 'session' } } as unknown as Request
}

function countingLoader(inner: ZoneLoader) {
	const counts = new Map<string, number>()
	const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
	for (const [name, original] of Object.entries(inner) as Array<[string, (...args: unknown[]) => Promise<unknown>]>) {
		methods[name] = (...args) => {
			counts.set(name, (counts.get(name) ?? 0) + 1)
			return original(...args)
		}
	}
	return { loader: methods as unknown as ZoneLoader, counts }
}

function zoneScope(granted: PermissionKey[], snapshot: ZoneSnapshot = WORLD) {
	const { loader, counts } = countingLoader(createInMemoryZoneLoader(snapshot))
	const scope = createAccessScope(async (_req, key) => granted.includes(key), loader)
	return { scope, counts }
}

function failingLoader(): ZoneLoader {
	const fail = async () => {
		throw new Error('zone unavailable')
	}
	return {
		topicIdsOf: fail,
		ownedGroupIdsOf: fail,
		topicOfTest: fail,
		topicsOfTests: fail,
		topicOfAttempt: fail,
		groupOwnerOf: fail,
		isMemberOfOwnedGroup: fail,
		studentIdsInOwnedGroups: fail,
	}
}

function grantedPairs(predicate: (testId: string, userId: string) => boolean, testIds: string[], userIds: string[]) {
	const pairs: Array<[string, string]> = []
	for (const testId of testIds) {
		for (const userId of userIds) {
			if (predicate(testId, userId)) pairs.push([testId, userId])
		}
	}
	return pairs
}

describe('новые функции шва по зоне (D-11)', () => {
	test('canManageCatalog требует tests.write и zone.all', async () => {
		expect(await zoneScope(['tests.write', 'zone.all']).scope.canManageCatalog(userReq(A))).toBe(true)
		expect(await zoneScope(['tests.write']).scope.canManageCatalog(userReq(A))).toBe(false)
		expect(await zoneScope(['zone.all']).scope.canManageCatalog(userReq(A))).toBe(false)
	})

	test('canManageGroup: своя группа с правом, чужая и без права — нет, zone.all — любая существующая', async () => {
		const teacher = zoneScope(['groups.manage_groups']).scope
		expect(await teacher.canManageGroup(userReq(A), G)).toBe(true)
		expect(await teacher.canManageGroup(userReq(A), GB)).toBe(false)
		expect(await teacher.canManageGroup(userReq(A), GA)).toBe(false)
		expect(await teacher.canManageGroup(userReq(A), 'missing-group')).toBe(false)
		expect(await zoneScope([]).scope.canManageGroup(userReq(A), G)).toBe(false)
		const admin = zoneScope(['groups.manage_groups', 'zone.all']).scope
		expect(await admin.canManageGroup(userReq(A), GB)).toBe(true)
		expect(await admin.canManageGroup(userReq(A), GA)).toBe(true)
		expect(await admin.canManageGroup(userReq(A), 'missing-group')).toBe(false)
		expect(await zoneScope(['zone.all']).scope.canManageGroup(userReq(A), G)).toBe(false)
	})

	test('groupScope: свои группы, zone.all — все, без права — пусто', async () => {
		expect(await zoneScope(['groups.manage_groups']).scope.groupScope(userReq(A))).toEqual({
			all: false,
			groupIds: [G],
		})
		expect(await zoneScope(['groups.manage_groups', 'zone.all']).scope.groupScope(userReq(A))).toEqual({ all: true })
		expect(await zoneScope(['zone.all']).scope.groupScope(userReq(A))).toEqual({ all: false, groupIds: [] })
	})

	test('userScope: группы учителя при users.read, zone.all — все, без users.read — пусто', async () => {
		expect(await zoneScope(['users.read']).scope.userScope(userReq(A))).toEqual({ all: false, groupIds: [G] })
		expect(await zoneScope(['users.read', 'zone.all']).scope.userScope(userReq(A))).toEqual({ all: true })
		expect(await zoneScope(['zone.all', 'groups.manage_groups']).scope.userScope(userReq(A))).toEqual({
			all: false,
			groupIds: [],
		})
	})

	test('canManageStudent: только ученик своей группы, zone.all — любой', async () => {
		const teacher = zoneScope([]).scope
		expect(await teacher.canManageStudent(userReq(A), S)).toBe(true)
		expect(await teacher.canManageStudent(userReq(A), S2)).toBe(false)
		expect(await teacher.canManageStudent(userReq(A), T)).toBe(false)
		expect(await teacher.canManageStudent(userReq(A), M)).toBe(false)
		expect(await teacher.canManageStudent(userReq(B), S)).toBe(false)
		const admin = zoneScope(['zone.all']).scope
		for (const userId of [S, S2, T, M, 'unknown-user']) {
			expect(await admin.canManageStudent(userReq(A), userId)).toBe(true)
		}
	})

	test('canAssign: право, раздел теста в зоне и ученик своей группы', async () => {
		const teacher = zoneScope(['tests.manage_assignments']).scope
		expect(await teacher.canAssign(userReq(A), tX, S)).toBe(true)
		expect(await teacher.canAssign(userReq(A), tY, S)).toBe(false)
		expect(await teacher.canAssign(userReq(A), tX, S2)).toBe(false)
		expect(await teacher.canAssign(userReq(A), tX, M)).toBe(false)
		expect(await teacher.canAssign(userReq(A), 'missing-test', S)).toBe(false)
		expect(await zoneScope([]).scope.canAssign(userReq(A), tX, S)).toBe(false)
		const admin = zoneScope(['tests.manage_assignments', 'zone.all']).scope
		expect(await admin.canAssign(userReq(A), tY, S2)).toBe(true)
		expect(await zoneScope(['zone.all']).scope.canAssign(userReq(A), tY, S2)).toBe(false)
	})

	test('canAssignMany: предикат по набору, одно чтение разделов тестов и учеников', async () => {
		const testIds = [tX, tX2, tY]
		const userIds = [S, S2]
		const teacher = zoneScope(['tests.manage_assignments'])
		const allowed = await teacher.scope.canAssignMany(userReq(A), testIds, userIds)
		expect(grantedPairs(allowed, testIds, userIds)).toEqual([
			[tX, S],
			[tX2, S],
		])
		expect(teacher.counts.get('topicsOfTests')).toBe(1)
		expect(teacher.counts.get('studentIdsInOwnedGroups')).toBe(1)
		expect(teacher.counts.get('topicIdsOf')).toBe(1)

		const denied = await zoneScope([]).scope.canAssignMany(userReq(A), testIds, userIds)
		expect(grantedPairs(denied, testIds, userIds)).toEqual([])

		const admin = zoneScope(['tests.manage_assignments', 'zone.all'])
		const all = await admin.scope.canAssignMany(userReq(A), testIds, userIds)
		expect(grantedPairs(all, testIds, userIds)).toHaveLength(testIds.length * userIds.length)
		expect(admin.counts.size).toBe(0)
	})

	test('canAssistSignIn: учитель — ученик своей группы, zone.all — по users.edit', async () => {
		const teacher = zoneScope([]).scope
		expect(await teacher.canAssistSignIn(userReq(A), S)).toBe(true)
		expect(await teacher.canAssistSignIn(userReq(A), S2)).toBe(false)
		const admin = zoneScope(['zone.all', 'users.edit']).scope
		expect(await admin.canAssistSignIn(userReq(A), S2)).toBe(true)
		expect(await admin.canAssistSignIn(userReq(A), T)).toBe(true)
		expect(await zoneScope(['zone.all']).scope.canAssistSignIn(userReq(A), S)).toBe(false)
	})

	test('hasGlobalZone — только zone.all', async () => {
		expect(await zoneScope(['zone.all']).scope.hasGlobalZone(userReq(A))).toBe(true)
		expect(await zoneScope(['tests.write', 'users.edit']).scope.hasGlobalZone(userReq(A))).toBe(false)
	})

	test('ошибка загрузчика зоны пробрасывается из каждой функции, читающей зону', async () => {
		const granted: PermissionKey[] = ['tests.manage_assignments', 'groups.manage_groups', 'users.read', 'users.edit']
		const scope = createAccessScope(async (_req, key) => granted.includes(key), failingLoader())
		const r = userReq(A)
		await expect(scope.canManageGroup(r, G)).rejects.toThrow('zone unavailable')
		await expect(scope.groupScope(r)).rejects.toThrow('zone unavailable')
		await expect(scope.userScope(r)).rejects.toThrow('zone unavailable')
		await expect(scope.canManageStudent(r, S)).rejects.toThrow('zone unavailable')
		await expect(scope.canAssign(r, tX, S)).rejects.toThrow('zone unavailable')
		await expect(scope.canAssignMany(r, [tX], [S])).rejects.toThrow('zone unavailable')
		await expect(scope.canAssistSignIn(r, S)).rejects.toThrow('zone unavailable')
	})

	test('ошибка проверки прав пробрасывается из каждой новой функции', async () => {
		const scope = createAccessScope(async () => {
			throw new Error('grants unavailable')
		}, createInMemoryZoneLoader(WORLD))
		const r = userReq(A)
		await expect(scope.canManageCatalog(r)).rejects.toThrow('grants unavailable')
		await expect(scope.hasGlobalZone(r)).rejects.toThrow('grants unavailable')
		await expect(scope.canManageGroup(r, G)).rejects.toThrow('grants unavailable')
		await expect(scope.groupScope(r)).rejects.toThrow('grants unavailable')
		await expect(scope.userScope(r)).rejects.toThrow('grants unavailable')
		await expect(scope.canManageStudent(r, S)).rejects.toThrow('grants unavailable')
		await expect(scope.canAssign(r, tX, S)).rejects.toThrow('grants unavailable')
		await expect(scope.canAssistSignIn(r, S)).rejects.toThrow('grants unavailable')
	})

	test('Request без пользователя — отказ и пустая зона даже при всех правах', async () => {
		const scope = zoneScope([
			'tests.write',
			'tests.manage_assignments',
			'groups.manage_groups',
			'users.read',
			'users.edit',
			'zone.all',
		]).scope
		const anonymous = {} as Request
		expect(await scope.canManageCatalog(anonymous)).toBe(false)
		expect(await scope.hasGlobalZone(anonymous)).toBe(false)
		expect(await scope.canManageGroup(anonymous, G)).toBe(false)
		expect(await scope.groupScope(anonymous)).toEqual({ all: false, groupIds: [] })
		expect(await scope.userScope(anonymous)).toEqual({ all: false, groupIds: [] })
		expect(await scope.canManageStudent(anonymous, S)).toBe(false)
		expect(await scope.canAssign(anonymous, tX, S)).toBe(false)
		expect(await scope.canAssistSignIn(anonymous, S)).toBe(false)
	})

	test('зона запрашивающего мемоизируется на Request и читается заново на новом', async () => {
		const { scope, counts } = zoneScope(['tests.manage_assignments', 'groups.manage_groups'])
		const first = userReq(A)
		expect(await scope.canAssign(first, tX, S)).toBe(true)
		expect(await scope.canAssign(first, tX2, S)).toBe(true)
		expect(await scope.groupScope(first)).toEqual({ all: false, groupIds: [G] })
		expect(await scope.groupScope(first)).toEqual({ all: false, groupIds: [G] })
		expect(counts.get('topicIdsOf')).toBe(1)
		expect(counts.get('ownedGroupIdsOf')).toBe(1)
		expect(await scope.canAssign(userReq(A), tX, S)).toBe(true)
		expect(await scope.groupScope(userReq(A))).toEqual({ all: false, groupIds: [G] })
		expect(counts.get('topicIdsOf')).toBe(2)
		expect(counts.get('ownedGroupIdsOf')).toBe(2)
	})

	test('шесть прежних функций отвечают по правам независимо от зоны', async () => {
		const outsider = userReq('nobody')
		const reader = zoneScope(['tests.read', 'tests.write', 'users.read']).scope
		expect(await reader.canReadTest(outsider, tY)).toBe(true)
		expect(await reader.canWriteTest(outsider, tY)).toBe(true)
		expect(await reader.canWriteTopic(outsider, Y)).toBe(true)
		expect(await reader.canReadUser(outsider, S2)).toBe(true)
		expect(await reader.canReviewAttempt(outsider, 'attempt-x')).toBe(true)
		expect(await reader.testScope(outsider)).toEqual({ all: true })
		const none = zoneScope([]).scope
		expect(await none.canReadTest(userReq(A), tX)).toBe(false)
		expect(await none.canReviewAttempt(userReq(A), 'attempt-x')).toBe(false)
		expect(await none.testScope(userReq(A))).toEqual({ all: false, topicIds: [] })
	})
})

describe('in-memory загрузчик зоны', () => {
	test('правило «ученик»: только роль ученика и без allow-строк', async () => {
		const loader = createInMemoryZoneLoader(WORLD)
		expect(await loader.studentIdsInOwnedGroups(A, [S, T, M, S2, S])).toEqual([S])
		expect(await loader.studentIdsInOwnedGroups(B, [S2])).toEqual([S2])
		expect(await loader.studentIdsInOwnedGroups('unknown', [S])).toEqual([])
	})

	test('разделы, группы, тесты и попытки; неизвестное — пусто или null', async () => {
		const loader = createInMemoryZoneLoader(WORLD)
		expect(await loader.topicIdsOf(A)).toEqual([X])
		expect(await loader.topicIdsOf('unknown')).toEqual([])
		expect(await loader.ownedGroupIdsOf(A)).toEqual([G])
		expect(await loader.topicOfTest(tY)).toBe(Y)
		expect(await loader.topicOfTest('missing')).toBeNull()
		expect(await loader.topicsOfTests([tX, 'missing'])).toEqual(new Map([[tX, X]]))
		expect(await loader.topicOfAttempt('attempt-x')).toBe(X)
		expect(await loader.topicOfAttempt('missing')).toBeNull()
		expect(await loader.groupOwnerOf(GA)).toEqual({ ownerId: null })
		expect(await loader.groupOwnerOf('missing')).toBeNull()
		expect(await loader.isMemberOfOwnedGroup(A, T)).toBe(true)
		expect(await loader.isMemberOfOwnedGroup(A, S2)).toBe(false)
	})
})
