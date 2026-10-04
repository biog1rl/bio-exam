'use client'

import { ROLES_LIST } from '@bio-exam/rbac'

import { useMemo } from 'react'

import useSWR from 'swr'

import { apiFetch } from '@/lib/api-fetch'

export type RoleTraits = {
	key: string
	name: string
	ownsZone: boolean | null
	groupMember: boolean | null
}

const ROLE_TRAITS_URL = '/api/rbac/roles'

function fallbackRoleTraits(): RoleTraits[] {
	return ROLES_LIST.map((role) => ({ key: role.key, name: role.name, ownsZone: null, groupMember: null }))
}

function asTrait(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null
}

function toRoleTraits(entry: unknown): RoleTraits | null {
	if (!entry || typeof entry !== 'object') return null
	const record = entry as Record<string, unknown>
	if (typeof record.key !== 'string' || typeof record.name !== 'string') return null
	return {
		key: record.key,
		name: record.name,
		ownsZone: asTrait(record.ownsZone),
		groupMember: asTrait(record.groupMember),
	}
}

export function parseRoleTraits(body: unknown): RoleTraits[] {
	if (!body || typeof body !== 'object') return fallbackRoleTraits()
	const list = (body as Record<string, unknown>).roles
	if (!Array.isArray(list)) return fallbackRoleTraits()
	const parsed = list.map(toRoleTraits).filter((entry): entry is RoleTraits => entry !== null)
	return parsed.length > 0 ? parsed : fallbackRoleTraits()
}

async function fetchRoleTraits(url: string): Promise<unknown> {
	const res = await apiFetch(url)
	if (!res.ok) throw new Error(`GET ${url} failed with status ${res.status}`)
	return res.json()
}

export function useRoleTraits(): { roles: RoleTraits[]; loaded: boolean } {
	const { data, error, isLoading } = useSWR<unknown>(ROLE_TRAITS_URL, fetchRoleTraits)
	const roles = useMemo(() => parseRoleTraits(error ? undefined : data), [data, error])
	return { roles, loaded: !isLoading && (data !== undefined || error !== undefined) }
}
