import { db } from '../../db/index.js'
import { accessPolicy, hasPermission } from './index.js'
import { createAccessScope, createUserTestRead } from './scope-rules.js'
import { createDrizzleZoneLoader } from './zone-loader.js'

export {
	createAccessScope,
	createUserTestRead,
	type AccessScope,
	type AssignPredicate,
	type GroupScope,
	type PermissionCheck,
	type TestScope,
	type UserPermissionCheck,
	type UserScope,
	type UserTestRead,
} from './scope-rules.js'
export type { AnswerPhotoSubject, ZoneLoader } from './zone-loader.js'

const zones = createDrizzleZoneLoader(db)

const scope = createAccessScope((req, key) => hasPermission(req, key), zones)

export const canUserReadTest = createUserTestRead(
	async (userId, key) => (await accessPolicy.accessFor(userId)).permissions.has(key),
	zones
)

export const canReadTest = scope.canReadTest
export const canWriteTest = scope.canWriteTest
export const canWriteTopic = scope.canWriteTopic
export const canReadUser = scope.canReadUser
export const canReviewAttempt = scope.canReviewAttempt
export const canReadAnswerPhoto = scope.canReadAnswerPhoto
export const testScope = scope.testScope
export const canManageCatalog = scope.canManageCatalog
export const canManageGroup = scope.canManageGroup
export const groupScope = scope.groupScope
export const userScope = scope.userScope
export const canManageStudent = scope.canManageStudent
export const canAssign = scope.canAssign
export const canAssignMany = scope.canAssignMany
export const canAssistSignIn = scope.canAssistSignIn
export const hasGlobalZone = scope.hasGlobalZone
