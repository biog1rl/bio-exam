import type { PermissionKey } from '@bio-exam/rbac'

import { and, eq } from 'drizzle-orm'
import type { Request } from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import type { ZoneLoader } from './zone-loader.js'

type ZoneStoreModule = typeof import('./zone-store.js')
type ZoneLoaderModule = typeof import('./zone-loader.js')
type ScopeRulesModule = typeof import('./scope-rules.js')

const PASSWORD = 'zone-store-password-1'

let ctx: AuthApp
let store: ZoneStoreModule
let loaderModule: ZoneLoaderModule
let rules: ScopeRulesModule

const ids = {
	admin: '',
	teacherA: '',
	teacherB: '',
	student: '',
	student2: '',
	teacherInGroup: '',
	methodist: '',
	noRole: '',
	topicX: '',
	topicY: '',
	testX: '',
	testY: '',
	groupG: '',
	groupGB: '',
	groupAdmins: '',
	attemptX: '',
	inactiveTeacher: '',
	invited: '',
	deactivated: '',
}

function requestOf(userId: string): Request {
	return { authUser: { id: userId, sessionId: 'zone-store-session' } } as unknown as Request
}

function checkWith(granted: PermissionKey[]) {
	return async (_req: Request, key: PermissionKey) => granted.includes(key)
}

async function insertTopic(slug: string): Promise<string> {
	const [row] = await ctx.db
		.insert(ctx.schema.topics)
		.values({ slug, title: `Раздел ${slug}` })
		.returning({ id: ctx.schema.topics.id })
	if (!row) throw new Error(`topic ${slug} was not created`)
	return row.id
}

async function insertTest(topicId: string, slug: string): Promise<string> {
	const [row] = await ctx.db
		.insert(ctx.schema.tests)
		.values({ topicId, slug, title: `Тест ${slug}` })
		.returning({ id: ctx.schema.tests.id })
	if (!row) throw new Error(`test ${slug} was not created`)
	return row.id
}

async function insertGroup(name: string, members: string[]): Promise<string> {
	const [row] = await ctx.db
		.insert(ctx.schema.studentGroups)
		.values({ name })
		.returning({ id: ctx.schema.studentGroups.id })
	if (!row) throw new Error(`group ${name} was not created`)
	if (members.length > 0) {
		await ctx.db.insert(ctx.schema.userGroups).values(members.map((userId) => ({ groupId: row.id, userId })))
	}
	return row.id
}

async function teacherTopicPairs(topicId: string): Promise<string[]> {
	const rows = await ctx.db
		.select({ teacherId: ctx.schema.teacherTopics.teacherId })
		.from(ctx.schema.teacherTopics)
		.where(eq(ctx.schema.teacherTopics.topicId, topicId))
	return rows.map((row) => row.teacherId).sort()
}

async function ownerOf(groupId: string): Promise<string | null | undefined> {
	const [row] = await ctx.db
		.select({ ownerId: ctx.schema.studentGroups.ownerId })
		.from(ctx.schema.studentGroups)
		.where(eq(ctx.schema.studentGroups.id, groupId))
	return row?.ownerId
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

beforeAll(async () => {
	ctx = await startAuthApp('test_zone_store')
	store = await import('./zone-store.js')
	loaderModule = await import('./zone-loader.js')
	rules = await import('./scope-rules.js')

	ids.admin = await seedUser(ctx, { login: 'zone_admin', roles: ['admin'], password: PASSWORD })
	ids.teacherA = await seedUser(ctx, { login: 'zone_teacher_a', roles: ['teacher'], password: PASSWORD })
	ids.teacherB = await seedUser(ctx, { login: 'zone_teacher_b', roles: ['teacher'], password: PASSWORD })
	ids.student = await seedUser(ctx, { login: 'zone_student', roles: ['user'], password: PASSWORD })
	ids.student2 = await seedUser(ctx, { login: 'zone_student_2', roles: ['user'], password: PASSWORD })
	ids.teacherInGroup = await seedUser(ctx, { login: 'zone_teacher_member', roles: ['teacher'], password: PASSWORD })
	ids.methodist = await seedUser(ctx, { login: 'zone_methodist', roles: ['user'], password: PASSWORD })
	ids.noRole = await seedUser(ctx, { login: 'zone_no_role', roles: [], password: PASSWORD })
	ids.inactiveTeacher = await seedUser(ctx, {
		login: 'zone_inactive_teacher',
		roles: ['teacher'],
		password: PASSWORD,
		isActive: false,
	})
	ids.invited = await seedUser(ctx, { login: 'zone_invited', roles: ['user'], password: PASSWORD, isActive: false })
	ids.deactivated = await seedUser(ctx, {
		login: 'zone_deactivated',
		roles: ['user'],
		password: PASSWORD,
		isActive: false,
	})
	await ctx.db.update(ctx.schema.users).set({ activatedAt: new Date() }).where(eq(ctx.schema.users.id, ids.deactivated))
	await ctx.db
		.update(ctx.schema.users)
		.set({ name: 'Анна Учитель', firstName: 'Анна', lastName: 'Учитель' })
		.where(eq(ctx.schema.users.id, ids.teacherA))
	await ctx.db
		.update(ctx.schema.users)
		.set({ name: 'Борис Учитель', firstName: 'Борис', lastName: 'Учитель' })
		.where(eq(ctx.schema.users.id, ids.teacherB))
	await ctx.db
		.insert(ctx.schema.rbacUserGrants)
		.values({ userId: ids.methodist, domain: 'tests', action: 'write', allow: true })

	ids.topicX = await insertTopic('zone-x')
	ids.topicY = await insertTopic('zone-y')
	ids.testX = await insertTest(ids.topicX, 'zone-test-x')
	ids.testY = await insertTest(ids.topicY, 'zone-test-y')
	ids.groupG = await insertGroup('Группа A', [ids.student, ids.teacherInGroup, ids.methodist])
	ids.groupGB = await insertGroup('Группа B', [ids.student2])
	ids.groupAdmins = await insertGroup('Группа администраторов', [ids.student2])

	const [attempt] = await ctx.db
		.insert(ctx.schema.testAttempts)
		.values({
			testId: ids.testX,
			userId: ids.student,
			answers: {},
			results: {},
			earnedPoints: 0,
			totalPoints: 1,
			scorePercentage: 0,
			finalEarnedPoints: 0,
			finalScorePercentage: 0,
			finalPassed: false,
			autoTotalPoints: 1,
		})
		.returning({ id: ctx.schema.testAttempts.id })
	if (!attempt) throw new Error('attempt was not created')
	ids.attemptX = attempt.id

	await store.setTopicTeachers(ctx.db, { topicId: ids.topicX, teacherIds: [ids.teacherA], assignedBy: ids.admin })
	await store.setTopicTeachers(ctx.db, { topicId: ids.topicY, teacherIds: [ids.teacherB], assignedBy: ids.admin })
	await store.setGroupOwner(ctx.db, { groupId: ids.groupG, ownerId: ids.teacherA })
	await store.setGroupOwner(ctx.db, { groupId: ids.groupGB, ownerId: ids.teacherB })
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('tracer: зона пишется модулем и решает canAssign на тестовой базе', () => {
	test('тест раздела учителя и ученик его группы — можно назначить, чужой раздел — нельзя', async () => {
		const scope = rules.createAccessScope(
			checkWith(['tests.manage_assignments']),
			loaderModule.createDrizzleZoneLoader(ctx.db)
		)
		expect(await scope.canAssign(requestOf(ids.teacherA), ids.testX, ids.student)).toBe(true)
		expect(await scope.canAssign(requestOf(ids.teacherA), ids.testY, ids.student)).toBe(false)
		expect(await scope.canAssign(requestOf(ids.teacherA), ids.testX, ids.teacherInGroup)).toBe(false)
		expect(await scope.canAssign(requestOf(ids.teacherA), ids.testX, ids.methodist)).toBe(false)
	})

	test('canAssignMany: предикат истинен только для пары (тест X, ученик), разделы и ученики читаются по разу', async () => {
		const { loader, counts } = countingLoader(loaderModule.createDrizzleZoneLoader(ctx.db))
		const scope = rules.createAccessScope(checkWith(['tests.manage_assignments']), loader)
		const testIds = [ids.testX, ids.testY]
		const userIds = [ids.student, ids.teacherInGroup, ids.methodist]
		const allowed = await scope.canAssignMany(requestOf(ids.teacherA), testIds, userIds)
		const granted: Array<[string, string]> = []
		for (const testId of testIds) {
			for (const userId of userIds) {
				if (allowed(testId, userId)) granted.push([testId, userId])
			}
		}
		expect(granted).toEqual([[ids.testX, ids.student]])
		expect(counts.get('topicsOfTests')).toBe(1)
		expect(counts.get('studentIdsInOwnedGroups')).toBe(1)
		expect(counts.get('topicIdsOf')).toBe(1)
	})
})

describe('загрузчик зоны Drizzle', () => {
	test('читает разделы, группы, раздел теста и попытки, владельца и членство', async () => {
		const loader = loaderModule.createDrizzleZoneLoader(ctx.db)
		expect(await loader.topicIdsOf(ids.teacherA)).toEqual([ids.topicX])
		expect(await loader.ownedGroupIdsOf(ids.teacherA)).toEqual([ids.groupG])
		expect(await loader.topicOfTest(ids.testY)).toBe(ids.topicY)
		expect(await loader.topicOfTest('00000000-0000-4000-8000-000000000000')).toBeNull()
		expect(await loader.topicOfTest('not-a-uuid')).toBeNull()
		expect(await loader.topicsOfTests([ids.testX, ids.testY])).toEqual(
			new Map([
				[ids.testX, ids.topicX],
				[ids.testY, ids.topicY],
			])
		)
		expect(await loader.topicsOfTests([])).toEqual(new Map())
		expect(await loader.topicOfAttempt(ids.attemptX)).toBe(ids.topicX)
		expect(await loader.groupOwnerOf(ids.groupG)).toEqual({ ownerId: ids.teacherA })
		expect(await loader.groupOwnerOf('00000000-0000-4000-8000-000000000000')).toBeNull()
		expect(await loader.isMemberOfOwnedGroup(ids.teacherA, ids.student)).toBe(true)
		expect(await loader.isMemberOfOwnedGroup(ids.teacherA, ids.student2)).toBe(false)
		expect(await loader.isMemberOfOwnedGroup(ids.teacherA, ids.teacherInGroup)).toBe(false)
		expect(await loader.isMemberOfOwnedGroup(ids.teacherA, ids.methodist)).toBe(false)
	})

	test('ошибка базы пробрасывается, доступ не выдаётся', async () => {
		const broken = loaderModule.createDrizzleZoneLoader({
			select: () => {
				throw new Error('zone db unavailable')
			},
			selectDistinct: () => {
				throw new Error('zone db unavailable')
			},
		} as unknown as AuthApp['db'])
		const scope = rules.createAccessScope(checkWith(['tests.manage_assignments']), broken)
		await expect(scope.canAssign(requestOf(ids.teacherA), ids.testX, ids.student)).rejects.toThrow(
			'zone db unavailable'
		)
	})
})

describe('запись зоны', () => {
	test('setTopicTeachers заменяет набор учителей раздела, повтор ничего не меняет', async () => {
		const topicId = await insertTopic('zone-replace')
		await store.setTopicTeachers(ctx.db, { topicId, teacherIds: [ids.teacherA], assignedBy: ids.admin })
		expect(await teacherTopicPairs(topicId)).toEqual([ids.teacherA])

		const replaced = await store.setTopicTeachers(ctx.db, {
			topicId,
			teacherIds: [ids.teacherB],
			assignedBy: ids.admin,
		})
		expect(replaced).toEqual([ids.teacherB])
		expect(await teacherTopicPairs(topicId)).toEqual([ids.teacherB])

		const [before] = await ctx.db
			.select({ assignedAt: ctx.schema.teacherTopics.assignedAt })
			.from(ctx.schema.teacherTopics)
			.where(and(eq(ctx.schema.teacherTopics.topicId, topicId), eq(ctx.schema.teacherTopics.teacherId, ids.teacherB)))
		const repeated = await store.setTopicTeachers(ctx.db, {
			topicId,
			teacherIds: [ids.teacherB],
			assignedBy: ids.admin,
		})
		expect(repeated).toEqual([ids.teacherB])
		const [after] = await ctx.db
			.select({ assignedAt: ctx.schema.teacherTopics.assignedAt })
			.from(ctx.schema.teacherTopics)
			.where(and(eq(ctx.schema.teacherTopics.topicId, topicId), eq(ctx.schema.teacherTopics.teacherId, ids.teacherB)))
		expect(after?.assignedAt).toEqual(before?.assignedAt)

		expect(await store.setTopicTeachers(ctx.db, { topicId, teacherIds: [], assignedBy: ids.admin })).toEqual([])
		expect(await teacherTopicPairs(topicId)).toEqual([])
	})

	test('releaseZone снимает закрепления и отдаёт группы администраторам, повтор — нули', async () => {
		const releasing = await seedUser(ctx, { login: 'zone_releasing', roles: ['teacher'], password: PASSWORD })
		const topicId = await insertTopic('zone-release')
		const groupId = await insertGroup('Группа освобождения', [ids.student])
		await store.setTopicTeachers(ctx.db, { topicId, teacherIds: [releasing], assignedBy: ids.admin })
		await store.setGroupOwner(ctx.db, { groupId, ownerId: releasing })

		expect(await store.releaseZone(ctx.db, releasing)).toEqual({ topics: 1, groups: 1 })
		expect(await teacherTopicPairs(topicId)).toEqual([])
		expect(await ownerOf(groupId)).toBeNull()
		expect(await store.releaseZone(ctx.db, releasing)).toEqual({ topics: 0, groups: 0 })
	})

	test('releaseZone внутри транзакции откатывается вместе с ней', async () => {
		const releasing = await seedUser(ctx, { login: 'zone_release_tx', roles: ['teacher'], password: PASSWORD })
		const topicId = await insertTopic('zone-release-tx')
		await store.setTopicTeachers(ctx.db, { topicId, teacherIds: [releasing], assignedBy: ids.admin })
		await expect(
			ctx.db.transaction(async (tx) => {
				await store.releaseZone(tx, releasing)
				throw new Error('rollback')
			})
		).rejects.toThrow('rollback')
		expect(await teacherTopicPairs(topicId)).toEqual([releasing])
	})
})

describe('чтение зоны для показа и правило «ученик»', () => {
	test('topicTeachers отдаёт учителей по разделам с полями ZonePerson', async () => {
		const teachers = await store.topicTeachers([ids.topicX, ids.topicY])
		expect(teachers.get(ids.topicX)).toEqual([
			{ id: ids.teacherA, name: 'Анна Учитель', firstName: 'Анна', lastName: 'Учитель' },
		])
		expect(teachers.get(ids.topicY)).toEqual([
			{ id: ids.teacherB, name: 'Борис Учитель', firstName: 'Борис', lastName: 'Учитель' },
		])
		expect(await store.topicTeachers([])).toEqual(new Map())
	})

	test('groupOwners отдаёт владельца или null для группы администраторов', async () => {
		const owners = await store.groupOwners([ids.groupG, ids.groupAdmins])
		expect(owners.get(ids.groupG)).toEqual({
			id: ids.teacherA,
			name: 'Анна Учитель',
			firstName: 'Анна',
			lastName: 'Учитель',
		})
		expect(owners.get(ids.groupAdmins)).toBeNull()
		expect(owners.has(ids.groupAdmins)).toBe(true)
	})

	test('zoneOwnerCandidates — активные пользователи с ролью-владельцем зоны', async () => {
		const candidates = (await store.zoneOwnerCandidates()).map((person) => person.id)
		expect(candidates).toEqual(expect.arrayContaining([ids.teacherA, ids.teacherB]))
		for (const excluded of [ids.inactiveTeacher, ids.admin, ids.student, ids.methodist, ids.noRole]) {
			expect(candidates).not.toContain(excluded)
		}
		expect(new Set(candidates).size).toBe(candidates.length)
		expect(await store.isZoneOwnerCandidate(ids.teacherA)).toBe(true)
		expect(await store.isZoneOwnerCandidate(ids.student)).toBe(false)
		expect(await store.isZoneOwnerCandidate(ids.inactiveTeacher)).toBe(false)
		expect(await store.isZoneOwnerCandidate(ids.admin)).toBe(false)
		expect(await store.isZoneOwnerCandidate('not-a-uuid')).toBe(false)
	})

	test('nonStudentUserIds и studentOnlyFilter: ученик — только роль ученика без allow-строк', async () => {
		expect(await store.nonStudentUserIds([ids.student, ids.teacherA, ids.methodist, ids.noRole])).toEqual([
			ids.teacherA,
			ids.methodist,
			ids.noRole,
		])
		expect(await store.nonStudentUserIds([])).toEqual([])
		const rows = await ctx.db
			.select({ id: ctx.schema.users.id })
			.from(ctx.schema.users)
			.where(store.studentOnlyFilter(ctx.schema.users.id))
		const studentIds = rows.map((row) => row.id)
		expect(studentIds).toContain(ids.student)
		for (const excluded of [ids.teacherA, ids.methodist, ids.noRole]) {
			expect(studentIds).not.toContain(excluded)
		}
	})

	test('ineligibleTeacherGroupMembers: не ученики, деактивированные и отдельно неактивированные', async () => {
		expect(
			await store.ineligibleTeacherGroupMembers([ids.student, ids.invited, ids.deactivated, ids.methodist])
		).toEqual({ notStudent: [ids.methodist], deactivated: [ids.deactivated], pending: [ids.invited] })
		expect(await store.ineligibleTeacherGroupMembers([])).toEqual({ notStudent: [], deactivated: [], pending: [] })
	})

	test('studentIdsInOwnedGroups отдаёт только учеников групп владельца', async () => {
		const loader = loaderModule.createDrizzleZoneLoader(ctx.db)
		expect(
			await loader.studentIdsInOwnedGroups(ids.teacherA, [ids.student, ids.teacherInGroup, ids.methodist, ids.student2])
		).toEqual([ids.student])
		expect(await loader.studentIdsInOwnedGroups(ids.teacherA, [])).toEqual([])
	})
})
