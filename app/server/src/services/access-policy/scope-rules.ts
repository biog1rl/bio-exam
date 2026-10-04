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

	return {
		canReadTest: (req, _testId) => check(req, 'tests.read'),
		canWriteTest: (req, _testId) => check(req, 'tests.write'),
		canWriteTopic: (req, _topicId) => check(req, 'tests.write'),
		canReadUser: (req, _userId) => check(req, 'users.read'),
		canReviewAttempt: (req, _attemptId) => check(req, 'tests.read'),
		testScope: async (req) => ((await check(req, 'tests.read')) ? { all: true } : { all: false, topicIds: [] }),
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
			return canManageStudent(req, studentId)
		},
		hasGlobalZone,
	}
}
