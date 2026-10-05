export const USERS_PATH = '/admin/users'

type ParamsLike = { get(name: string): string | null }

export function parseUsersGroup(params: ParamsLike): string | null {
	const value = params.get('group')?.trim() ?? ''
	return value.length > 0 && value.length <= 200 ? value : null
}

export function usersUrl(group: string | null): string {
	return group ? `${USERS_PATH}?group=${encodeURIComponent(group)}` : USERS_PATH
}

export function effectiveGroup(requested: string | null, groups: readonly { id: string }[] | undefined): string | null {
	if (!requested || groups === undefined) return requested
	return groups.some((group) => group.id === requested) ? requested : null
}
