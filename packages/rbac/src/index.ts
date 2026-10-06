export { PERMISSION_DOMAINS } from './domains'
export type { PermissionDomain, ActionOf, PermissionKey } from './domains'

export { ROLE_REGISTRY, ROLE_KEYS, ROLES_LIST, STUDENT_ROLE_KEY, STAFF_ROLE_KEYS, roleDisplayName } from './roles'
export type { RoleKey, RoleConfig, RoleGrant } from './roles'

export { can } from './rbac'
export {
	RESERVED_TOPIC_SLUGS,
	SECTION_PERMISSIONS,
	canAccessSection,
	canOpenPath,
	isReservedTopicSlug,
	sectionForPath,
} from './sections'
export type { Section } from './sections'
export { normaliseRoleKeys } from './access'
