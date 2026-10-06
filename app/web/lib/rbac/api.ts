import type { RoleKey } from '@bio-exam/rbac'

import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'

export type RbacRoleRow = {
	key: RoleKey
	name: string
	order: number
	grants: Record<string, string[]>
}

export type RbacOverrideRow = { roleKey: string; domain: string; action: string; allow: boolean }

export type RbacRolesResponse = { roles: RbacRoleRow[]; overrides: RbacOverrideRow[] }

export type RoleGrantTarget = { roleKey: RoleKey; domain: string; action: string }

export type RoleGrantBody = RoleGrantTarget & { allow: boolean }

const ROLE_GRANT_URL = '/api/rbac/grant'

export const rbacKeys = {
	roles: () => '/api/rbac/roles' as const,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseRbacRoles(body: unknown): RbacRolesResponse {
	if (!isRecord(body) || !Array.isArray(body.roles) || !Array.isArray(body.overrides)) throw new MalformedBodyError()
	return body as RbacRolesResponse
}

export const rbacRolesFetcher = fetcherWith(parseRbacRoles)

export function setRoleGrant(body: RoleGrantBody): Promise<RequestOutcome<unknown>> {
	return request(ROLE_GRANT_URL, { method: 'POST', json: body, fallbackMessage: 'Ошибка сохранения' })
}

export function deleteRoleGrant(target: RoleGrantTarget): Promise<RequestOutcome<unknown>> {
	const { roleKey, domain, action } = target
	return request(ROLE_GRANT_URL, {
		method: 'DELETE',
		json: { roleKey, domain, action },
		fallbackMessage: 'Ошибка сохранения',
	})
}
