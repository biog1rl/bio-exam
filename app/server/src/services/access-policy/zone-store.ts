import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { studentGroups, teacherTopics, userRoles, users } from '../../db/schema.js'
import { loadRoleTraits } from './role-traits.js'
import { studentOnlyFilter, zoneIds } from './zone-loader.js'

export { studentOnlyFilter } from './zone-loader.js'

export type ZoneExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ZonePerson = { id: string; name: string | null; firstName: string | null; lastName: string | null }

const personColumns = {
	id: users.id,
	name: users.name,
	firstName: users.firstName,
	lastName: users.lastName,
}

function personOf(row: ZonePerson): ZonePerson {
	return { id: row.id, name: row.name, firstName: row.firstName, lastName: row.lastName }
}

export async function setTopicTeachers(
	executor: ZoneExecutor,
	params: { topicId: string; teacherIds: string[]; assignedBy: string | null }
): Promise<string[]> {
	const teacherIds = [...new Set(params.teacherIds)]
	return executor.transaction(async (tx) => {
		await tx
			.delete(teacherTopics)
			.where(
				teacherIds.length === 0
					? eq(teacherTopics.topicId, params.topicId)
					: and(eq(teacherTopics.topicId, params.topicId), notInArray(teacherTopics.teacherId, teacherIds))
			)
		if (teacherIds.length > 0) {
			await tx
				.insert(teacherTopics)
				.values(teacherIds.map((teacherId) => ({ teacherId, topicId: params.topicId, assignedBy: params.assignedBy })))
				.onConflictDoNothing()
		}
		const rows = await tx
			.select({ teacherId: teacherTopics.teacherId })
			.from(teacherTopics)
			.where(eq(teacherTopics.topicId, params.topicId))
			.orderBy(asc(teacherTopics.teacherId))
		return rows.map((row) => row.teacherId)
	})
}

export async function setGroupOwner(
	executor: ZoneExecutor,
	params: { groupId: string; ownerId: string | null }
): Promise<void> {
	await executor.update(studentGroups).set({ ownerId: params.ownerId }).where(eq(studentGroups.id, params.groupId))
}

export async function releaseZone(executor: ZoneExecutor, userId: string): Promise<{ topics: number; groups: number }> {
	if (zoneIds([userId]).length === 0) return { topics: 0, groups: 0 }
	return executor.transaction(async (tx) => {
		const topics = await tx
			.delete(teacherTopics)
			.where(eq(teacherTopics.teacherId, userId))
			.returning({ topicId: teacherTopics.topicId })
		const groups = await tx
			.update(studentGroups)
			.set({ ownerId: null })
			.where(eq(studentGroups.ownerId, userId))
			.returning({ id: studentGroups.id })
		return { topics: topics.length, groups: groups.length }
	})
}

export async function topicTeachers(
	topicIds: string[],
	executor: ZoneExecutor = db
): Promise<Map<string, ZonePerson[]>> {
	const wanted = zoneIds(topicIds)
	const result = new Map<string, ZonePerson[]>()
	if (wanted.length === 0) return result
	for (const topicId of wanted) result.set(topicId, [])
	const rows = await executor
		.select({ topicId: teacherTopics.topicId, ...personColumns })
		.from(teacherTopics)
		.innerJoin(users, eq(users.id, teacherTopics.teacherId))
		.where(inArray(teacherTopics.topicId, wanted))
		.orderBy(asc(users.name), asc(users.id))
	for (const row of rows) result.get(row.topicId)?.push(personOf(row))
	return result
}

export async function groupOwners(
	groupIds: string[],
	executor: ZoneExecutor = db
): Promise<Map<string, ZonePerson | null>> {
	const wanted = zoneIds(groupIds)
	const result = new Map<string, ZonePerson | null>()
	if (wanted.length === 0) return result
	const rows = await executor
		.select({
			groupId: studentGroups.id,
			ownerId: users.id,
			name: users.name,
			firstName: users.firstName,
			lastName: users.lastName,
		})
		.from(studentGroups)
		.leftJoin(users, eq(users.id, studentGroups.ownerId))
		.where(inArray(studentGroups.id, wanted))
	for (const row of rows) {
		result.set(
			row.groupId,
			row.ownerId === null
				? null
				: { id: row.ownerId, name: row.name, firstName: row.firstName, lastName: row.lastName }
		)
	}
	return result
}

async function zoneOwnerRoleKeys(executor: ZoneExecutor): Promise<string[]> {
	const traits = await loadRoleTraits(executor)
	return [...traits].filter(([, trait]) => trait.ownsZone).map(([roleKey]) => roleKey)
}

function zoneOwnerFilter(roleKeys: string[]) {
	return sql`exists (select 1 from ${userRoles} where ${userRoles.userId} = ${users.id} and ${inArray(userRoles.roleKey, roleKeys)})`
}

export async function zoneOwnerCandidates(executor: ZoneExecutor = db): Promise<ZonePerson[]> {
	const roleKeys = await zoneOwnerRoleKeys(executor)
	if (roleKeys.length === 0) return []
	const rows = await executor
		.select(personColumns)
		.from(users)
		.where(and(eq(users.isActive, true), zoneOwnerFilter(roleKeys)))
		.orderBy(asc(users.name), asc(users.id))
	return rows.map(personOf)
}

export async function isZoneOwnerCandidate(userId: string, executor: ZoneExecutor = db): Promise<boolean> {
	if (zoneIds([userId]).length === 0) return false
	const roleKeys = await zoneOwnerRoleKeys(executor)
	if (roleKeys.length === 0) return false
	const [row] = await executor
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, userId), eq(users.isActive, true), zoneOwnerFilter(roleKeys)))
		.limit(1)
	return Boolean(row)
}

async function studentIdsAmong(wanted: string[], executor: ZoneExecutor): Promise<Set<string>> {
	if (wanted.length === 0) return new Set()
	const rows = await executor
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.id, wanted), studentOnlyFilter(users.id)))
	return new Set(rows.map((row) => row.id))
}

export async function nonStudentUserIds(userIds: string[], executor: ZoneExecutor = db): Promise<string[]> {
	const unique = [...new Set(userIds)]
	const students = await studentIdsAmong(zoneIds(unique), executor)
	return unique.filter((userId) => !students.has(userId))
}

export async function ineligibleTeacherGroupMembers(
	userIds: string[],
	executor: ZoneExecutor = db
): Promise<{ notStudent: string[]; deactivated: string[] }> {
	const unique = [...new Set(userIds)]
	const wanted = zoneIds(unique)
	if (unique.length === 0) return { notStudent: [], deactivated: [] }
	const rows =
		wanted.length === 0
			? []
			: await executor
					.select({
						id: users.id,
						isActive: users.isActive,
						activatedAt: users.activatedAt,
						isStudent: sql<boolean>`${studentOnlyFilter(users.id)}`,
					})
					.from(users)
					.where(inArray(users.id, wanted))
	const byId = new Map(rows.map((row) => [row.id, row]))
	const notStudent: string[] = []
	const deactivated: string[] = []
	for (const userId of unique) {
		const row = byId.get(userId)
		if (!row || !row.isStudent) {
			notStudent.push(userId)
			continue
		}
		if (!row.isActive && row.activatedAt !== null) deactivated.push(userId)
	}
	return { notStudent, deactivated }
}
