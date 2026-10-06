import { STUDENT_ROLE_KEY } from '@bio-exam/rbac'

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import type { db as Database } from '../../db/index.js'
import {
	rbacUserGrants,
	studentGroups,
	teacherTopics,
	testAttempts,
	tests,
	userGroups,
	userRoles,
} from '../../db/schema.js'
import { isUuid } from '../../lib/uuid.js'

export interface ZoneLoader {
	topicIdsOf(userId: string): Promise<string[]>
	ownedGroupIdsOf(userId: string): Promise<string[]>
	topicOfTest(testId: string): Promise<string | null>
	topicsOfTests(testIds: string[]): Promise<Map<string, string>>
	topicOfAttempt(attemptId: string): Promise<string | null>
	groupOwnerOf(groupId: string): Promise<{ ownerId: string | null } | null>
	isMemberOfOwnedGroup(ownerId: string, userId: string): Promise<boolean>
	studentIdsInOwnedGroups(ownerId: string, userIds: string[]): Promise<string[]>
}

export type ZoneSnapshot = {
	teacherTopics?: Readonly<Record<string, ReadonlyArray<string>>>
	groups?: ReadonlyArray<{ id: string; ownerId: string | null; members: ReadonlyArray<string> }>
	tests?: Readonly<Record<string, string>>
	attempts?: Readonly<Record<string, string>>
	roleKeysByUser?: Readonly<Record<string, ReadonlyArray<string>>>
	usersWithAllowGrants?: ReadonlyArray<string>
}

export function zoneIds(values: ReadonlyArray<string>): string[] {
	return [...new Set(values)].filter(isUuid)
}

export function studentOnlyFilter(userId: AnyPgColumn): SQL {
	return sql`(exists (select 1 from ${userRoles} where ${userRoles.userId} = ${userId} and ${userRoles.roleKey} = ${STUDENT_ROLE_KEY}) and not exists (select 1 from ${userRoles} where ${userRoles.userId} = ${userId} and ${userRoles.roleKey} <> ${STUDENT_ROLE_KEY}) and not exists (select 1 from ${rbacUserGrants} where ${rbacUserGrants.userId} = ${userId} and ${rbacUserGrants.allow} = true))`
}

export function studentOnlySql(userIdExpr: string, values: unknown[]): string {
	values.push(STUDENT_ROLE_KEY)
	const roleKey = `$${values.length}::text`
	return `(exists (select 1 from user_roles sr where sr.user_id = ${userIdExpr} and sr.role_key = ${roleKey}) and not exists (select 1 from user_roles sr where sr.user_id = ${userIdExpr} and sr.role_key <> ${roleKey}) and not exists (select 1 from rbac_user_grants sg where sg.user_id = ${userIdExpr} and sg.allow = true))`
}

export function createDrizzleZoneLoader(database: typeof Database): ZoneLoader {
	return {
		async topicIdsOf(userId) {
			if (!isUuid(userId)) return []
			const rows = await database
				.select({ topicId: teacherTopics.topicId })
				.from(teacherTopics)
				.where(eq(teacherTopics.teacherId, userId))
			return rows.map((row) => row.topicId)
		},
		async ownedGroupIdsOf(userId) {
			if (!isUuid(userId)) return []
			const rows = await database
				.select({ id: studentGroups.id })
				.from(studentGroups)
				.where(eq(studentGroups.ownerId, userId))
			return rows.map((row) => row.id)
		},
		async topicOfTest(testId) {
			if (!isUuid(testId)) return null
			const [row] = await database.select({ topicId: tests.topicId }).from(tests).where(eq(tests.id, testId)).limit(1)
			return row?.topicId ?? null
		},
		async topicsOfTests(testIds) {
			const wanted = zoneIds(testIds)
			const found = new Map<string, string>()
			if (wanted.length === 0) return found
			const rows = await database
				.select({ id: tests.id, topicId: tests.topicId })
				.from(tests)
				.where(inArray(tests.id, wanted))
			for (const row of rows) found.set(row.id, row.topicId)
			return found
		},
		async topicOfAttempt(attemptId) {
			if (!isUuid(attemptId)) return null
			const [row] = await database
				.select({ topicId: tests.topicId })
				.from(testAttempts)
				.innerJoin(tests, eq(tests.id, testAttempts.testId))
				.where(eq(testAttempts.id, attemptId))
				.limit(1)
			return row?.topicId ?? null
		},
		async groupOwnerOf(groupId) {
			if (!isUuid(groupId)) return null
			const [row] = await database
				.select({ ownerId: studentGroups.ownerId })
				.from(studentGroups)
				.where(eq(studentGroups.id, groupId))
				.limit(1)
			return row ? { ownerId: row.ownerId } : null
		},
		async isMemberOfOwnedGroup(ownerId, userId) {
			if (!isUuid(ownerId) || !isUuid(userId)) return false
			const [row] = await database
				.select({ userId: userGroups.userId })
				.from(userGroups)
				.innerJoin(studentGroups, eq(studentGroups.id, userGroups.groupId))
				.where(
					and(eq(studentGroups.ownerId, ownerId), eq(userGroups.userId, userId), studentOnlyFilter(userGroups.userId))
				)
				.limit(1)
			return Boolean(row)
		},
		async studentIdsInOwnedGroups(ownerId, userIds) {
			const wanted = zoneIds(userIds)
			if (!isUuid(ownerId) || wanted.length === 0) return []
			const rows = await database
				.selectDistinct({ userId: userGroups.userId })
				.from(userGroups)
				.innerJoin(studentGroups, eq(studentGroups.id, userGroups.groupId))
				.where(
					and(
						eq(studentGroups.ownerId, ownerId),
						inArray(userGroups.userId, wanted),
						studentOnlyFilter(userGroups.userId)
					)
				)
			return rows.map((row) => row.userId)
		},
	}
}

function isSnapshotStudent(snapshot: ZoneSnapshot, userId: string): boolean {
	const roleKeys = snapshot.roleKeysByUser?.[userId] ?? []
	if (roleKeys.length === 0) return false
	if (!roleKeys.every((roleKey) => roleKey === STUDENT_ROLE_KEY)) return false
	return !(snapshot.usersWithAllowGrants ?? []).includes(userId)
}

function ownedGroups(snapshot: ZoneSnapshot, ownerId: string) {
	return (snapshot.groups ?? []).filter((group) => group.ownerId !== null && group.ownerId === ownerId)
}

export function createInMemoryZoneLoader(snapshot: ZoneSnapshot): ZoneLoader {
	return {
		async topicIdsOf(userId) {
			return [...(snapshot.teacherTopics?.[userId] ?? [])]
		},
		async ownedGroupIdsOf(userId) {
			return ownedGroups(snapshot, userId).map((group) => group.id)
		},
		async topicOfTest(testId) {
			return snapshot.tests?.[testId] ?? null
		},
		async topicsOfTests(testIds) {
			const found = new Map<string, string>()
			for (const testId of new Set(testIds)) {
				const topicId = snapshot.tests?.[testId]
				if (topicId !== undefined) found.set(testId, topicId)
			}
			return found
		},
		async topicOfAttempt(attemptId) {
			const testId = snapshot.attempts?.[attemptId]
			if (testId === undefined) return null
			return snapshot.tests?.[testId] ?? null
		},
		async groupOwnerOf(groupId) {
			const group = (snapshot.groups ?? []).find((item) => item.id === groupId)
			return group ? { ownerId: group.ownerId } : null
		},
		async isMemberOfOwnedGroup(ownerId, userId) {
			if (!isSnapshotStudent(snapshot, userId)) return false
			return ownedGroups(snapshot, ownerId).some((group) => group.members.includes(userId))
		},
		async studentIdsInOwnedGroups(ownerId, userIds) {
			const members = new Set(ownedGroups(snapshot, ownerId).flatMap((group) => [...group.members]))
			return [...new Set(userIds)].filter((userId) => members.has(userId) && isSnapshotStudent(snapshot, userId))
		},
	}
}
