import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'

export type AvatarUpload = { avatarUrl: string | null; avatarCroppedUrl: string | null }

export type OwnProfileBody = {
	firstName?: string | null
	lastName?: string | null
	login?: string | null
	avatar?: string | null
	avatarColor?: string | null
	initials?: string | null
}

export type PasswordBody = { oldPassword: string; newPassword: string }

const AVATAR_URL = '/api/users/avatar'
const PROFILE_URL = '/api/users/profile'

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === 'string'
}

export function parseAvatarUpload(body: unknown): AvatarUpload {
	if (!isRecord(body) || !isNullableString(body.avatarUrl) || !isNullableString(body.avatarCroppedUrl)) {
		throw new MalformedBodyError()
	}
	return body as AvatarUpload
}

export function uploadAvatar(form: FormData): Promise<RequestOutcome<AvatarUpload>> {
	return request(AVATAR_URL, { method: 'POST', body: form, parse: parseAvatarUpload })
}

export function deleteAvatar(): Promise<RequestOutcome<unknown>> {
	return request(AVATAR_URL, { method: 'DELETE' })
}

export function updateOwnProfile(body: OwnProfileBody): Promise<RequestOutcome<unknown>> {
	return request(PROFILE_URL, { method: 'PATCH', json: body })
}

export function changeOwnPassword(body: PasswordBody): Promise<RequestOutcome<unknown>> {
	return request(`${PROFILE_URL}/password`, { method: 'POST', json: body })
}
