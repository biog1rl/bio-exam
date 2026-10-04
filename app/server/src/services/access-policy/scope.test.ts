import { ROLE_REGISTRY, STUDENT_ROLE_KEY, type PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'
import { describe, expect, test } from 'vitest'

import { createAccessScope } from './scope-rules.js'
import { createInMemoryZoneLoader, type ZoneLoader, type ZoneSnapshot } from './zone-loader.js'

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
	attempts: { 'attempt-x': tX, 'attempt-y': tY },
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

describe('шесть прежних функций шва по зоне (D-11)', () => {
	test('canReadTest: tests.read и раздел теста в зоне, zone.all — любой существующий', async () => {
		const teacher = zoneScope(['tests.read']).scope
		expect(await teacher.canReadTest(userReq(A), tX)).toBe(true)
		expect(await teacher.canReadTest(userReq(A), tX2)).toBe(true)
		expect(await teacher.canReadTest(userReq(A), tY)).toBe(false)
		expect(await teacher.canReadTest(userReq(B), tX)).toBe(false)
		expect(await teacher.canReadTest(userReq(A), 'missing-test')).toBe(false)
		expect(await zoneScope([]).scope.canReadTest(userReq(A), tX)).toBe(false)
		expect(await zoneScope(['zone.all']).scope.canReadTest(userReq(A), tX)).toBe(false)
		const global = zoneScope(['tests.read', 'zone.all']).scope
		expect(await global.canReadTest(userReq(A), tY)).toBe(true)
		expect(await global.canReadTest(userReq(S), tY)).toBe(true)
		expect(await global.canReadTest(userReq(A), 'missing-test')).toBe(true)
	})

	test('testScope: без tests.read пусто, с zone.all — все, иначе разделы зоны', async () => {
		expect(await zoneScope(['tests.read']).scope.testScope(userReq(A))).toEqual({ all: false, topicIds: [X] })
		expect(await zoneScope(['tests.read']).scope.testScope(userReq(S))).toEqual({ all: false, topicIds: [] })
		expect(await zoneScope(['tests.read', 'zone.all']).scope.testScope(userReq(A))).toEqual({ all: true })
		expect(await zoneScope(['tests.write', 'users.read', 'zone.all']).scope.testScope(userReq(A))).toEqual({
			all: false,
			topicIds: [],
		})
	})

	test('canWriteTest: tests.write и раздел теста в зоне', async () => {
		const teacher = zoneScope(['tests.write']).scope
		expect(await teacher.canWriteTest(userReq(A), tX)).toBe(true)
		expect(await teacher.canWriteTest(userReq(A), tY)).toBe(false)
		expect(await teacher.canWriteTest(userReq(A), 'missing-test')).toBe(false)
		expect(await zoneScope(['tests.read']).scope.canWriteTest(userReq(A), tX)).toBe(false)
		const global = zoneScope(['tests.write', 'zone.all']).scope
		expect(await global.canWriteTest(userReq(A), tY)).toBe(true)
		expect(await zoneScope(['zone.all']).scope.canWriteTest(userReq(A), tY)).toBe(false)
	})

	test('canWriteTopic: tests.write и раздел в зоне, несуществующий без zone.all — нет', async () => {
		const teacher = zoneScope(['tests.write']).scope
		expect(await teacher.canWriteTopic(userReq(A), X)).toBe(true)
		expect(await teacher.canWriteTopic(userReq(A), Y)).toBe(false)
		expect(await teacher.canWriteTopic(userReq(A), 'missing-topic')).toBe(false)
		expect(await zoneScope(['tests.read']).scope.canWriteTopic(userReq(A), X)).toBe(false)
		const global = zoneScope(['tests.write', 'zone.all']).scope
		expect(await global.canWriteTopic(userReq(A), Y)).toBe(true)
		expect(await zoneScope(['zone.all']).scope.canWriteTopic(userReq(A), Y)).toBe(false)
	})

	test('canReviewAttempt: tests.read и раздел теста попытки в зоне', async () => {
		const teacher = zoneScope(['tests.read']).scope
		expect(await teacher.canReviewAttempt(userReq(A), 'attempt-x')).toBe(true)
		expect(await teacher.canReviewAttempt(userReq(A), 'attempt-y')).toBe(false)
		expect(await teacher.canReviewAttempt(userReq(A), 'missing-attempt')).toBe(false)
		expect(await zoneScope([]).scope.canReviewAttempt(userReq(A), 'attempt-x')).toBe(false)
		const global = zoneScope(['tests.read', 'zone.all']).scope
		expect(await global.canReviewAttempt(userReq(A), 'attempt-y')).toBe(true)
		expect(await global.canReviewAttempt(userReq(A), 'missing-attempt')).toBe(true)
		expect(await zoneScope(['zone.all']).scope.canReviewAttempt(userReq(A), 'attempt-y')).toBe(false)
	})

	test('canReadUser: users.read и участник группы запрашивающего, zone.all — любой', async () => {
		const teacher = zoneScope(['users.read']).scope
		expect(await teacher.canReadUser(userReq(A), S)).toBe(true)
		expect(await teacher.canReadUser(userReq(A), T)).toBe(true)
		expect(await teacher.canReadUser(userReq(A), S2)).toBe(false)
		expect(await teacher.canReadUser(userReq(B), S)).toBe(false)
		expect(await teacher.canReadUser(userReq(B), S2)).toBe(true)
		expect(await teacher.canReadUser(userReq(A), 'unknown-user')).toBe(false)
		expect(await zoneScope([]).scope.canReadUser(userReq(A), S)).toBe(false)
		expect(await zoneScope(['zone.all']).scope.canReadUser(userReq(A), S2)).toBe(false)
		const global = zoneScope(['users.read', 'zone.all']).scope
		expect(await global.canReadUser(userReq(A), S2)).toBe(true)
		expect(await global.canReadUser(userReq(A), 'unknown-user')).toBe(true)
	})

	test('пользователь без разделов и групп получает пустую зону при любых правах без zone.all', async () => {
		const scope = zoneScope(['tests.read', 'tests.write', 'users.read']).scope
		const outsider = userReq('nobody')
		expect(await scope.canReadTest(outsider, tX)).toBe(false)
		expect(await scope.canWriteTest(outsider, tX)).toBe(false)
		expect(await scope.canWriteTopic(outsider, X)).toBe(false)
		expect(await scope.canReviewAttempt(outsider, 'attempt-x')).toBe(false)
		expect(await scope.canReadUser(outsider, S)).toBe(false)
		expect(await scope.testScope(outsider)).toEqual({ all: false, topicIds: [] })
	})

	test('без проверки прав зона не читается', async () => {
		const { scope, counts } = zoneScope([])
		const r = userReq(A)
		expect(await scope.canReadTest(r, tX)).toBe(false)
		expect(await scope.canWriteTest(r, tX)).toBe(false)
		expect(await scope.canWriteTopic(r, X)).toBe(false)
		expect(await scope.canReviewAttempt(r, 'attempt-x')).toBe(false)
		expect(await scope.canReadUser(r, S)).toBe(false)
		expect(await scope.testScope(r)).toEqual({ all: false, topicIds: [] })
		expect(counts.size).toBe(0)
	})

	test('разделы запрашивающего читаются один раз на Request', async () => {
		const { scope, counts } = zoneScope(['tests.read', 'tests.write'])
		const r = userReq(A)
		expect(await scope.canReadTest(r, tX)).toBe(true)
		expect(await scope.canWriteTest(r, tX2)).toBe(true)
		expect(await scope.canWriteTopic(r, X)).toBe(true)
		expect(await scope.canReviewAttempt(r, 'attempt-x')).toBe(true)
		expect(await scope.testScope(r)).toEqual({ all: false, topicIds: [X] })
		expect(counts.get('topicIdsOf')).toBe(1)
	})

	test('Request без пользователя — отказ и пустой охват даже при всех правах', async () => {
		const scope = zoneScope(['tests.read', 'tests.write', 'users.read', 'zone.all']).scope
		const anonymous = {} as Request
		expect(await scope.canReadTest(anonymous, tX)).toBe(false)
		expect(await scope.canWriteTest(anonymous, tX)).toBe(false)
		expect(await scope.canWriteTopic(anonymous, X)).toBe(false)
		expect(await scope.canReviewAttempt(anonymous, 'attempt-x')).toBe(false)
		expect(await scope.canReadUser(anonymous, S)).toBe(false)
		expect(await scope.testScope(anonymous)).toEqual({ all: false, topicIds: [] })
	})

	test('ошибка проверки прав пробрасывается, доступ не выдаётся', async () => {
		const scope = createAccessScope(async () => {
			throw new Error('grants unavailable')
		}, createInMemoryZoneLoader(WORLD))
		const r = userReq(A)
		await expect(scope.canReadTest(r, tX)).rejects.toThrow('grants unavailable')
		await expect(scope.canWriteTest(r, tX)).rejects.toThrow('grants unavailable')
		await expect(scope.canWriteTopic(r, X)).rejects.toThrow('grants unavailable')
		await expect(scope.canReviewAttempt(r, 'attempt-x')).rejects.toThrow('grants unavailable')
		await expect(scope.canReadUser(r, S)).rejects.toThrow('grants unavailable')
		await expect(scope.testScope(r)).rejects.toThrow('grants unavailable')
	})

	test('ошибка загрузчика зоны пробрасывается, доступ не выдаётся', async () => {
		const granted: PermissionKey[] = ['tests.read', 'tests.write', 'users.read']
		const scope = createAccessScope(async (_req, key) => granted.includes(key), failingLoader())
		const r = userReq(A)
		await expect(scope.canReadTest(r, tX)).rejects.toThrow('zone unavailable')
		await expect(scope.canWriteTest(r, tX)).rejects.toThrow('zone unavailable')
		await expect(scope.canWriteTopic(r, X)).rejects.toThrow('zone unavailable')
		await expect(scope.canReviewAttempt(r, 'attempt-x')).rejects.toThrow('zone unavailable')
		await expect(scope.canReadUser(r, S)).rejects.toThrow('zone unavailable')
		await expect(scope.testScope(r)).rejects.toThrow('zone unavailable')
	})
})

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
