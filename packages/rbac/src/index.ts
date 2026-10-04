export { PERMISSION_DOMAINS } from './domains'
export type { PermissionDomain, ActionOf, PermissionKey } from './domains'

export { ROLE_REGISTRY, ROLE_KEYS, ROLES_LIST, STUDENT_ROLE_KEY, STAFF_ROLE_KEYS, roleDisplayName } from './roles'
export type { RoleKey, RoleConfig, RoleGrant } from './roles'

export { can } from './rbac'
export type { AccessRule, SubjectActionMap } from './access'
export {
	normaliseRoleKeys,
	normaliseUserIdentifiers,
	normaliseRoleAccessMap,
	normaliseUserAccessMap,
	createAccessRule,
	accessRuleToSerializable,
	normaliseActionList,
} from './access'
