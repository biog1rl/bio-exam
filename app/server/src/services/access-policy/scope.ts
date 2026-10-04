import { db } from '../../db/index.js'
import { hasPermission } from './index.js'
import { createAccessScope } from './scope-rules.js'
import { createDrizzleZoneLoader } from './zone-loader.js'

export {
	createAccessScope,
	type AccessScope,
	type AssignPredicate,
	type GroupScope,
	type PermissionCheck,
	type TestScope,
	type UserScope,
} from './scope-rules.js'
export type { ZoneLoader } from './zone-loader.js'

const scope = createAccessScope((req, key) => hasPermission(req, key), createDrizzleZoneLoader(db))

export const canReadTest = scope.canReadTest
export const canWriteTest = scope.canWriteTest
export const canWriteTopic = scope.canWriteTopic
export const canReadUser = scope.canReadUser
export const canReviewAttempt = scope.canReviewAttempt
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
