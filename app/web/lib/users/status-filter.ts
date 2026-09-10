export type UserStatus = 'active' | 'inactive' | 'all'

export function matchesUserStatus(isActive: boolean | 0 | 1, status: UserStatus): boolean {
	return status === 'all' || Boolean(isActive) === (status === 'active')
}
