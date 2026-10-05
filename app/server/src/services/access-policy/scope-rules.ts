import type { PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'

import type { ZoneLoader } from './zone-loader.js'

export type PermissionCheck = (req: Request, key: PermissionKey) => Promise<boolean>

export type TestScope = { all: true } | { all: false; topicIds: string[] }

export type GroupScope = { all: true } | { all: false; groupIds: string[] }

export type UserScope = { all: true } | { all: false; groupIds: string[] }

export type AssignPredicate = (testId: string, userId: string) => boolean

export type AccessScope = {
	canReadTest(req: Request, testId: string): Promise<boolean>
	canWriteTest(req: Request, testId: string): Promise<boolean>
	canWriteTopic(req: Request, topicId: string): Promise<boolean>
	canReadUser(req: Request, userId: string): Promise<boolean>
	canReviewAttempt(req: Request, attemptId: string): Promise<boolean>
	testScope(req: Request): Promise<TestScope>
	canManageCatalog(req: Request): Promise<boolean>
	canManageGroup(req: Request, groupId: string): Promise<boolean>
	groupScope(req: Request): Promise<GroupScope>
	userScope(req: Request): Promise<UserScope>
	canManageStudent(req: Request, userId: string): Promise<boolean>
	canAssign(req: Request, testId: string, userId: string): Promise<boolean>
	canAssignMany(req: Request, testIds: string[], userIds: string[]): Promise<AssignPredicate>
	canAssistSignIn(req: Request, userId: string): Promise<boolean>
	hasGlobalZone(req: Request): Promise<boolean>
}

type RequestZone = { userId: string; topicIds?: Promise<string[]>; groupIds?: Promise<string[]> }

const DENY_ALL: AssignPredicate = () => false
const ALLOW_ALL: AssignPredicate = () => true

export function createAccessScope(check: PermissionCheck, zones: ZoneLoader): AccessScope {
	const perRequest = new WeakMap<Request, RequestZone>()

	function zoneEntry(req: Request, userId: string): RequestZone {
		const cached = perRequest.get(req)
		if (cached && cached.userId === userId) return cached
		const entry: RequestZone = { userId }
		perRequest.set(req, entry)
		return entry
	}

	function myTopicIds(req: Request, userId: string): Promise<string[]> {
		const entry = zoneEntry(req, userId)
		entry.topicIds ??= zones.topicIdsOf(userId)
		return entry.topicIds
	}

	function myGroupIds(req: Request, userId: string): Promise<string[]> {
		const entry = zoneEntry(req, userId)
		entry.groupIds ??= zones.ownedGroupIdsOf(userId)
		return entry.groupIds
	}

	async function hasGlobalZone(req: Request): Promise<boolean> {
		if (!req.authUser?.id) return false
		return check(req, 'zone.all')
	}

	async function ownedGroupScope(req: Request, key: PermissionKey): Promise<GroupScope> {
		const userId = req.authUser?.id
		if (!userId) return { all: false, groupIds: [] }
		if (!(await check(req, key))) return { all: false, groupIds: [] }
		if (await check(req, 'zone.all')) return { all: true }
		return { all: false, groupIds: [...(await myGroupIds(req, userId))] }
	}

	async function canManageStudent(req: Request, studentId: string): Promise<boolean> {
		const userId = req.authUser?.id
		if (!userId) return false
		if (await check(req, 'zone.all')) return true
		const students = await zones.studentIdsInOwnedGroups(userId, [studentId])
		return students.includes(studentId)
	}

	async function canAssignMany(req: Request, testIds: string[], userIds: string[]): Promise<AssignPredicate> {
		const userId = req.authUser?.id
		if (!userId) return DENY_ALL
		if (!(await check(req, 'tests.manage_assignments'))) return DENY_ALL
		if (await check(req, 'zone.all')) return ALLOW_ALL
		const [topicIds, testTopics, studentIds] = await Promise.all([
			myTopicIds(req, userId),
			zones.topicsOfTests(testIds),
			zones.studentIdsInOwnedGroups(userId, userIds),
		])
		const topics = new Set(topicIds)
		const students = new Set(studentIds)
		return (testId, studentId) => {
			const topicId = testTopics.get(testId)
			return topicId !== undefined && topics.has(topicId) && students.has(studentId)
		}
	}

	async function topicInZone(req: Request, userId: string, topicId: string | null): Promise<boolean> {
		if (topicId === null) return false
		return (await myTopicIds(req, userId)).includes(topicId)
	}

	async function zoned(
		req: Request,
		key: PermissionKey,
		inZone: (userId: string) => Promise<boolean>
	): Promise<boolean> {
		const userId = req.authUser?.id
		if (!userId) return false
		if (!(await check(req, key))) return false
		if (await check(req, 'zone.all')) return true
		return inZone(userId)
	}

	const canReadTest = (req: Request, testId: string) =>
		zoned(req, 'tests.read', async (userId) => topicInZone(req, userId, await zones.topicOfTest(testId)))

	const canWriteTest = (req: Request, testId: string) =>
		zoned(req, 'tests.write', async (userId) => topicInZone(req, userId, await zones.topicOfTest(testId)))

	const canWriteTopic = (req: Request, topicId: string) =>
		zoned(req, 'tests.write', (userId) => topicInZone(req, userId, topicId))

	const canReviewAttempt = (req: Request, attemptId: string) =>
		zoned(req, 'tests.read', async (userId) => topicInZone(req, userId, await zones.topicOfAttempt(attemptId)))

	const canReadUser = (req: Request, targetId: string) =>
		zoned(req, 'users.read', (userId) => zones.isMemberOfOwnedGroup(userId, targetId))

	async function testScope(req: Request): Promise<TestScope> {
		const userId = req.authUser?.id
		if (!userId) return { all: false, topicIds: [] }
		if (!(await check(req, 'tests.read'))) return { all: false, topicIds: [] }
		if (await check(req, 'zone.all')) return { all: true }
		return { all: false, topicIds: [...(await myTopicIds(req, userId))] }
	}

	return {
		canReadTest,
		canWriteTest,
		canWriteTopic,
		canReadUser,
		canReviewAttempt,
		testScope,
		canManageCatalog: async (req) => {
			if (!req.authUser?.id) return false
			return (await check(req, 'tests.write')) && (await check(req, 'zone.all'))
		},
		canManageGroup: async (req, groupId) => {
			const userId = req.authUser?.id
			if (!userId) return false
			if (!(await check(req, 'groups.manage_groups'))) return false
			const global = await check(req, 'zone.all')
			const group = await zones.groupOwnerOf(groupId)
			if (!group) return false
			if (global) return true
			return group.ownerId !== null && group.ownerId === userId
		},
		groupScope: (req) => ownedGroupScope(req, 'groups.manage_groups'),
		userScope: (req) => ownedGroupScope(req, 'users.read'),
		canManageStudent,
		canAssignMany,
		canAssign: async (req, testId, userId) => (await canAssignMany(req, [testId], [userId]))(testId, userId),
		canAssistSignIn: async (req, studentId) => {
			if (!req.authUser?.id) return false
			if (await check(req, 'zone.all')) return check(req, 'users.edit')
			if (!(await check(req, 'users.read'))) return false
			return canManageStudent(req, studentId)
		},
		hasGlobalZone,
	}
}
