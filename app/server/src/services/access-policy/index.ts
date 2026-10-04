import type { PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'

import { db } from '../../db/index.js'
import { createDrizzleGrantsLoader } from './grants-loader.js'
import { createAccessPolicy, type AccessSet } from './policy.js'

export {
	computeAccess,
	createAccessPolicy,
	isValidAction,
	type AccessPolicy,
	type AccessSet,
	type GrantsLoader,
	type GrantsSnapshot,
	type RoleDefinition,
	type RoleGrantRow,
	type RoleRegistry,
	type UserGrantRow,
} from './policy.js'
export { createDrizzleGrantsLoader, createInMemoryGrantsLoader } from './grants-loader.js'

export const accessPolicy = createAccessPolicy({ loader: createDrizzleGrantsLoader(db) })

type RequestEntry = { userId: string; access: Promise<AccessSet> }

const perRequest = new WeakMap<Request, RequestEntry>()

export function requestAccess(req: Request): Promise<AccessSet> {
	const userId = req.authUser?.id
	if (!userId) return Promise.reject(new Error('requestAccess: request has no authenticated user'))
	const cached = perRequest.get(req)
	if (cached && cached.userId === userId) return cached.access
	const access = accessPolicy.accessFor(userId)
	perRequest.set(req, { userId, access })
	return access
}

export async function hasPermission(req: Request, key: PermissionKey): Promise<boolean> {
	const access = await requestAccess(req)
	return access.permissions.has(key)
}

export {
	canAssign,
	canAssignMany,
	canAssistSignIn,
	canManageCatalog,
	canManageGroup,
	canManageStudent,
	canReadTest,
	canReadUser,
	canReviewAttempt,
	canWriteTest,
	canWriteTopic,
	createAccessScope,
	groupScope,
	hasGlobalZone,
	testScope,
	userScope,
	type AccessScope,
	type AssignPredicate,
	type GroupScope,
	type PermissionCheck,
	type TestScope,
	type UserScope,
	type ZoneLoader,
} from './scope.js'
export { createDrizzleZoneLoader, createInMemoryZoneLoader, type ZoneSnapshot } from './zone-loader.js'
export {
	groupOwners,
	ineligibleTeacherGroupMembers,
	isZoneOwnerCandidate,
	nonStudentUserIds,
	releaseZone,
	setGroupOwner,
	setTopicTeachers,
	studentOnlyFilter,
	topicTeachers,
	zoneOwnerCandidates,
	type ZoneExecutor,
	type ZonePerson,
} from './zone-store.js'
export { loadRoleTraits, roleTraits, type RoleTraits } from './role-traits.js'
