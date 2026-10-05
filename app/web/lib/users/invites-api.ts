import { MalformedBodyError, request, type RequestOutcome } from '@/lib/http/request'

import type { InvitePayload } from './invite-form'

export type InviteBody = InvitePayload

export type InviteLink = { inviteLink: string }

const INVITES_URL = '/api/auth/invites'

export function parseInviteLink(body: unknown): InviteLink {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	const link = (body as Record<string, unknown>).inviteLink
	if (typeof link !== 'string' || !link) throw new MalformedBodyError()
	return body as InviteLink
}

export function createInvite(body: InviteBody): Promise<RequestOutcome<InviteLink>> {
	return request(INVITES_URL, { method: 'POST', json: body, parse: parseInviteLink })
}

export function reissueInvite(userId: string): Promise<RequestOutcome<InviteLink>> {
	return request(INVITES_URL, { method: 'POST', json: { userId }, parse: parseInviteLink })
}
