import { groupOwnerLabel, type InviteGroupOwner } from './invite-form'

export type RoleWarning = 'none' | 'teacher-without-topics' | 'zone-release'

type ZoneSide = { ownsZone: boolean | null }

type ZoneTrait = { key: string; ownsZone: boolean | null }

export function groupsTriggerLabel(groups: ReadonlyArray<{ name: string }>): string {
	const count = groups.length
	if (count === 0) return 'Без групп'
	if (count === 1) return groups[0].name
	if (count <= 4) return `${count} группы`
	return `${count} групп`
}

export function groupIdsChanged(initialIds: ReadonlyArray<string>, selectedIds: ReadonlyArray<string>): boolean {
	const initial = new Set(initialIds)
	const selected = new Set(selectedIds)
	if (initial.size !== selected.size) return true
	for (const id of selected) {
		if (!initial.has(id)) return true
	}
	return false
}

export function groupItemSuffix(owner: InviteGroupOwner | null | undefined): string {
	const label = groupOwnerLabel(owner)
	return label === null ? '' : ` · ${label}`
}

export function initialOwnsZone(roleKeys: ReadonlyArray<string>, traits: ReadonlyArray<ZoneTrait>): boolean | null {
	let unknown = false
	for (const key of roleKeys) {
		const trait = traits.find((entry) => entry.key === key)
		if (!trait || trait.ownsZone === null) {
			unknown = true
			continue
		}
		if (trait.ownsZone) return true
	}
	return unknown ? null : false
}

export function roleWarning(input: { from: ZoneSide; to: ZoneSide; deactivating: boolean }): RoleWarning {
	const { from, to, deactivating } = input
	if (from.ownsZone === null || to.ownsZone === null) return 'none'
	if (from.ownsZone) return !to.ownsZone || deactivating ? 'zone-release' : 'none'
	return to.ownsZone ? 'teacher-without-topics' : 'none'
}

export function roleWillChange(selectedRole: string | null, initialRole: string | null): boolean {
	return selectedRole !== null && selectedRole !== initialRole
}

export function editRoleWarning(input: {
	traits: ReadonlyArray<ZoneTrait>
	loaded: boolean
	initialRoleKeys: ReadonlyArray<string>
	initialRole: string | null
	selectedRole: string | null
	initialActive: boolean
	isActive: boolean
}): RoleWarning {
	if (!input.loaded) return 'none'
	const fromOwnsZone = initialOwnsZone(input.initialRoleKeys, input.traits)
	const toOwnsZone =
		input.selectedRole !== null && roleWillChange(input.selectedRole, input.initialRole)
			? initialOwnsZone([input.selectedRole], input.traits)
			: fromOwnsZone
	return roleWarning({
		from: { ownsZone: fromOwnsZone },
		to: { ownsZone: toOwnsZone },
		deactivating: input.initialActive && !input.isActive,
	})
}

export type UserPatch = {
	firstName: string
	lastName: string
	login: string
	isActive: boolean
	birthdate: string | null
	telegram: string
	phone: string
	email: string
	roles?: string[]
}

export function buildUserPatch(input: {
	firstName: string
	lastName: string
	login: string
	isActive: boolean
	birthdate: string
	telegram: string
	phone: string
	email: string
	selectedRole: string | null
	initialRole: string | null
}): UserPatch {
	const patch: UserPatch = {
		firstName: input.firstName,
		lastName: input.lastName,
		login: input.login,
		isActive: input.isActive,
		birthdate: input.birthdate || null,
		telegram: input.telegram,
		phone: input.phone,
		email: input.email,
	}
	if (input.selectedRole !== null && roleWillChange(input.selectedRole, input.initialRole)) {
		patch.roles = [input.selectedRole]
	}
	return patch
}
