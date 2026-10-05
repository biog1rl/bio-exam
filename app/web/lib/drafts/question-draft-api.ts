import { MalformedBodyError, request } from '@/lib/http/request'
import { KEEPALIVE_BODY_LIMIT_BYTES } from '@/lib/tests/api'

import type { QuestionDraftAutosaveApi, QuestionDraftSaveResult } from './question-draft-autosave'

const FAILED: QuestionDraftSaveResult = { kind: 'failed' }

const STATUS_RESULT: Record<number, QuestionDraftSaveResult> = {
	409: { kind: 'conflict' },
	403: { kind: 'forbidden' },
	404: { kind: 'gone' },
}

function parseDraftLockVersion(body: unknown): number {
	if (!body || typeof body !== 'object') throw new MalformedBodyError()
	const draft = (body as { draft?: unknown }).draft
	if (!draft || typeof draft !== 'object') throw new MalformedBodyError()
	const value = (draft as { lockVersion?: unknown }).lockVersion
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new MalformedBodyError()
	return value
}

export function questionDraftAutosaveApi(testId: string, draftId: string): QuestionDraftAutosaveApi {
	const url = `/api/tests/${testId}/question-drafts/${draftId}`

	return {
		async save(payload, lockVersion, options) {
			const body = lockVersion === null ? { payload } : { payload, lockVersion }
			if (options.keepalive && new TextEncoder().encode(JSON.stringify(body)).length > KEEPALIVE_BODY_LIMIT_BYTES) {
				return FAILED
			}
			const outcome = await request(url, {
				method: 'PATCH',
				json: body,
				keepalive: options.keepalive,
				parse: parseDraftLockVersion,
			})
			if (outcome.ok) return { kind: 'ok', lockVersion: outcome.data }
			if (outcome.kind === 'http' && outcome.status !== undefined) return STATUS_RESULT[outcome.status] ?? FAILED
			return FAILED
		},
		async readLockVersion() {
			const outcome = await request(url, { cache: 'no-store', parse: parseDraftLockVersion })
			return outcome.ok ? outcome.data : null
		},
	}
}
