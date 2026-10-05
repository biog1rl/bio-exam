import { MalformedBodyError, request, requestJson, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import type { ProgressAttempt } from '@/lib/progress/attempt-chart'
import type { UserRow } from '@/types/users'

export type UserTestAssignment = {
	testId: string
	testTitle: string
	testSlug: string
	assignedAt: string
	canUnassign: boolean
}

export type UserAssignmentsResponse = { assignments: UserTestAssignment[] }

export type UserAttemptsResponse = { attempts: ProgressAttempt[] }

function userPath(id: string): string {
	return `/api/users/${encodeURIComponent(id)}`
}

export const usersKeys = {
	list: () => '/api/users' as const,
	byLogin: (login: string) => `/api/users/by-login/${encodeURIComponent(login)}`,
	byId: (id: string) => userPath(id),
	assignments: (userId: string) => `${userPath(userId)}/test-assignments`,
	attempts: (userId: string) => `${userPath(userId)}/test-attempts`,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

export const userByLoginFetcher = fetcherWith(parseUserEnvelope)

export const userAssignmentsFetcher = fetcherWith(parseUserAssignments)

export const userAttemptsFetcher = fetcherWith(parseUserAttempts)

export function getUserByLogin(login: string): Promise<UserRow> {
	return requestJson(usersKeys.byLogin(login), { parse: parseUserEnvelope })
}

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
