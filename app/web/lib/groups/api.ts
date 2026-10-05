import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'

import type { GroupOwner, GroupSavePayload } from './group-form'

export type { GroupOwner }

export type GroupPayload = GroupSavePayload

export type Group = {
	id: string
	name: string
	memberCount: number
	createdAt: string
	owner?: GroupOwner | null
}

export type GroupMember = { id: string; name: string | null; login: string | null; isActive: boolean }

export type GroupDetail = {
	id: string
	name: string
	createdAt: string
	members: GroupMember[]
}

export type Candidate = {
	id: string
	name: string | null
	firstName: string | null
	lastName: string | null
}

export type MyGroup = { id: string; name: string }

export type GroupsList = { groups: Group[] }

export type MyGroupsList = { groups: MyGroup[] }

export type GroupDetailEnvelope = { group: GroupDetail }

export type CandidatesList = { users: Candidate[] }

export type OwnerOptions = { owners: GroupOwner[] }

function groupPath(id: string): string {
	return `/api/groups/${encodeURIComponent(id)}`
}

export const groupsKeys = {
	list: () => '/api/groups' as const,
	my: () => '/api/groups/my' as const,
	detail: (id: string) => groupPath(id),
	candidates: (q: string) => `/api/groups/candidates?q=${encodeURIComponent(q.trim())}`,
	ownerOptions: () => '/api/groups/owner-options' as const,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function arrayEnvelope<T>(body: unknown, field: string): T {
	if (!isRecord(body) || !Array.isArray(body[field])) throw new MalformedBodyError()
	return body as T
}

export function parseGroupsList(body: unknown): GroupsList {
	return arrayEnvelope<GroupsList>(body, 'groups')
}

export function parseMyGroups(body: unknown): MyGroupsList {
	return arrayEnvelope<MyGroupsList>(body, 'groups')
}

export function parseGroupDetail(body: unknown): GroupDetailEnvelope {
	if (!isRecord(body)) throw new MalformedBodyError()
	const group = body.group
	if (!isRecord(group) || typeof group.id !== 'string' || !Array.isArray(group.members)) {
		throw new MalformedBodyError()
	}
	return body as GroupDetailEnvelope
}

export function parseCandidates(body: unknown): CandidatesList {
	return arrayEnvelope<CandidatesList>(body, 'users')
}

export function parseOwnerOptions(body: unknown): OwnerOptions {
	return arrayEnvelope<OwnerOptions>(body, 'owners')
}

export const groupsListFetcher = fetcherWith(parseGroupsList)

export const myGroupsFetcher = fetcherWith(parseMyGroups)

export const groupDetailFetcher = fetcherWith(parseGroupDetail)

export const candidatesFetcher = fetcherWith(parseCandidates)

export const ownerOptionsFetcher = fetcherWith(parseOwnerOptions)

export function saveGroup(input: { id?: string; body: GroupPayload }): Promise<RequestOutcome<unknown>> {
	if (input.id) return request(groupPath(input.id), { method: 'PATCH', json: input.body })
	return request(groupsKeys.list(), { method: 'POST', json: input.body })
}

export function deleteGroup(id: string): Promise<RequestOutcome<unknown>> {
	return request(groupPath(id), { method: 'DELETE' })
}
