import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import type { ProgressAttempt } from '@/lib/progress/attempt-chart'
import { attemptResultView, type AttemptResultFields } from '@/lib/tests/attempt-result-view'
import type { UserPatch } from '@/lib/users/edit-user-form'
import { isRecord } from '@/lib/utils/is-record'
import type { UserRow } from '@/types/users'

export type UserTestAssignment = {
	testId: string
	testTitle: string
	testSlug: string
	assignedAt: string
	canUnassign: boolean
}

export type UserAssignmentsResponse = { assignments: UserTestAssignment[] }

export type UserAttemptRow = AttemptResultFields & {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string | null
	submittedAt: string
}

export type UserAttemptsResponse = { attempts: UserAttemptRow[] }

export function userAttemptToProgress(row: UserAttemptRow): ProgressAttempt | null {
	const view = attemptResultView(row)
	if (view.kind === 'pending') return null
	return {
		attemptId: row.attemptId,
		testId: row.testId,
		testTitle: row.testTitle,
		testSlug: row.testSlug,
		topicSlug: row.topicSlug,
		topicTitle: row.topicTitle,
		submittedAt: row.submittedAt,
		earnedPoints: view.points.earned,
		totalPoints: view.points.total,
		scorePercentage: view.percent,
		passed: view.passed,
	}
}

export type UsersList = { rows: UserRow[]; total: number }

export type PatchUserBody = UserPatch

export type GrantsResponse = {
	roles: string[]
	roleKeys: string[]
	userOverrides: Array<{ domain: string; action: string; allow: boolean }>
	effective: string[]
}

export type UserGrantTarget = { userId: string; domain: string; action: string }

export type UserGrantBody = UserGrantTarget & { allow: boolean }

const USER_GRANT_URL = '/api/rbac/user/grant'

function userPath(id: string): string {
	return `/api/users/${encodeURIComponent(id)}`
}

export const usersKeys = {
	list: () => '/api/users' as const,
	byLogin: (login: string) => `/api/users/by-login/${encodeURIComponent(login)}`,
	assignments: (userId: string) => `${userPath(userId)}/test-assignments`,
	attempts: (userId: string) => `${userPath(userId)}/test-attempts`,
}

export function userGrantsKey(userId: string): string {
	return `/api/rbac/user/${encodeURIComponent(userId)}/grants`
}

export function parseUserEnvelope(body: unknown): UserRow {
	if (!isRecord(body)) throw new MalformedBodyError()
	const user = body.user
	if (!isRecord(user)) throw new MalformedBodyError()
	if (typeof user.id !== 'string' || !user.id) throw new MalformedBodyError()
	if (!('login' in user) || (user.login !== null && typeof user.login !== 'string')) throw new MalformedBodyError()
	return user as UserRow
}

export function parseUserAssignments(body: unknown): UserAssignmentsResponse {
	if (!isRecord(body) || !Array.isArray(body.assignments)) throw new MalformedBodyError()
	return body as UserAssignmentsResponse
}

export function parseUserAttempts(body: unknown): UserAttemptsResponse {
	if (!isRecord(body) || !Array.isArray(body.attempts)) throw new MalformedBodyError()
	return body as UserAttemptsResponse
}

export function parseUsersList(body: unknown): UsersList {
	if (!isRecord(body) || !Array.isArray(body.rows) || typeof body.total !== 'number') throw new MalformedBodyError()
	return body as UsersList
}

export function parseUserGrants(body: unknown): GrantsResponse {
	if (!isRecord(body)) throw new MalformedBodyError()
	for (const field of ['roles', 'roleKeys', 'userOverrides', 'effective']) {
		if (!Array.isArray(body[field])) throw new MalformedBodyError()
	}
	return body as GrantsResponse
}

export const usersListFetcher = fetcherWith(parseUsersList)

export const userGrantsFetcher = fetcherWith(parseUserGrants)

export const userByLoginFetcher = fetcherWith(parseUserEnvelope)

export const userAssignmentsFetcher = fetcherWith(parseUserAssignments)

export const userAttemptsFetcher = fetcherWith(parseUserAttempts)

export function assignTest(userId: string, testId: string): Promise<RequestOutcome<unknown>> {
	return request(usersKeys.assignments(userId), { method: 'POST', json: { testId } })
}

export function unassignTest(userId: string, testId: string): Promise<RequestOutcome<unknown>> {
	return request(`${usersKeys.assignments(userId)}/${encodeURIComponent(testId)}`, { method: 'DELETE' })
}

export function revokeUserSessions(userId: string): Promise<RequestOutcome<unknown>> {
	return request(`${userPath(userId)}/sessions/revoke`, { method: 'POST' })
}

export function clearLoginThrottle(userId: string): Promise<RequestOutcome<unknown>> {
	return request(`${userPath(userId)}/login-throttle`, { method: 'DELETE' })
}

export function updateUser(userId: string, body: PatchUserBody): Promise<RequestOutcome<unknown>> {
	return request(userPath(userId), { method: 'PATCH', json: body })
}

export function setUserGroups(userId: string, groupIds: string[]): Promise<RequestOutcome<unknown>> {
	return request(`${userPath(userId)}/group`, { method: 'PATCH', json: { groupIds } })
}

export function deleteUser(userId: string): Promise<RequestOutcome<unknown>> {
	return request(userPath(userId), { method: 'DELETE' })
}

export function setUserGrant(body: UserGrantBody): Promise<RequestOutcome<unknown>> {
	return request(USER_GRANT_URL, { method: 'POST', json: body })
}

export function removeUserGrant(target: UserGrantTarget): Promise<RequestOutcome<unknown>> {
	const { userId, domain, action } = target
	return request(USER_GRANT_URL, { method: 'DELETE', json: { userId, domain, action } })
}
