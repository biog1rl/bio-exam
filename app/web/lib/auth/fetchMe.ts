import type { PermissionKey, RoleKey } from '@bio-exam/rbac'

import { tryRefreshSession } from './refresh'

export type AuthMe = {
	id: string
	login: string | null
	firstName: string | null
	lastName: string | null
	avatar: string | null
	avatarCropped: string | null
	avatarColor: string | null
	initials: string | null
	avatarCropX: number | null
	avatarCropY: number | null
	avatarCropZoom: number | null
	avatarCropRotation: number | null
	avatarCropViewX: number | null
	avatarCropViewY: number | null
	roles: RoleKey[]
	perms: PermissionKey[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asNullableString(value: unknown): string | null {
	return typeof value === 'string' ? value : null
}

function asNullableNumber(value: unknown): number | null {
	return typeof value === 'number' ? value : null
}

function asStringArray<T extends string>(value: unknown): T[] {
	if (!Array.isArray(value)) return []
	return value.filter((entry): entry is T => typeof entry === 'string')
}

function parseAuthMe(body: unknown): AuthMe | null {
	const payload = asRecord(body)
	if (!payload || payload.ok !== true) return null

	const user = asRecord(payload.user)
	const id = user?.id
	if (typeof id !== 'string' || !id) return null

	return {
		id,
		login: asNullableString(user.login),
		firstName: asNullableString(user.firstName),
		lastName: asNullableString(user.lastName),
		avatar: asNullableString(user.avatar),
		avatarCropped: asNullableString(user.avatarCropped),
		avatarColor: asNullableString(user.avatarColor),
		initials: asNullableString(user.initials),
		avatarCropX: asNullableNumber(user.avatarCropX),
		avatarCropY: asNullableNumber(user.avatarCropY),
		avatarCropZoom: asNullableNumber(user.avatarCropZoom),
		avatarCropRotation: asNullableNumber(user.avatarCropRotation),
		avatarCropViewX: asNullableNumber(user.avatarCropViewX),
		avatarCropViewY: asNullableNumber(user.avatarCropViewY),
		roles: asStringArray<RoleKey>(user.roles),
		perms: asStringArray<PermissionKey>(user.perms),
	}
}

async function readAuthMeResponse(): Promise<{ response: Response; body: unknown | null }> {
	const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
	const body = await response.json().catch(() => null)
	return { response, body }
}

function shouldTryRefresh(response: Response, body: unknown): boolean {
	if (response.status === 401) return true

	const payload = asRecord(body)
	return response.ok && payload?.ok === false
}

export async function fetchAuthMe(): Promise<AuthMe | null> {
	let current = await readAuthMeResponse()
	let me = parseAuthMe(current.body)
	if (me) return me

	if (!shouldTryRefresh(current.response, current.body)) return null

	const refreshed = await tryRefreshSession()
	if (!refreshed) return null

	current = await readAuthMeResponse()
	me = parseAuthMe(current.body)
	return me
}
