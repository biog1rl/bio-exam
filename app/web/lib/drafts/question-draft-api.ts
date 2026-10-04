import { apiFetch } from '@/lib/api-fetch'
import { KEEPALIVE_BODY_LIMIT_BYTES } from '@/lib/tests/api'

import type { QuestionDraftAutosaveApi, QuestionDraftSaveResult } from './question-draft-autosave'

const FAILED: QuestionDraftSaveResult = { kind: 'failed' }

const STATUS_RESULT: Record<number, QuestionDraftSaveResult> = {
	409: { kind: 'conflict' },
	403: { kind: 'forbidden' },
	404: { kind: 'gone' },
}

function readDraftLockVersion(body: unknown): number | null {
	if (!body || typeof body !== 'object') return null
	const draft = (body as { draft?: unknown }).draft
	if (!draft || typeof draft !== 'object') return null
	const value = (draft as { lockVersion?: unknown }).lockVersion
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function questionDraftAutosaveApi(testId: string, draftId: string): QuestionDraftAutosaveApi {
	const url = `/api/tests/${testId}/question-drafts/${draftId}`

	return {
		async save(payload, lockVersion, options) {
			const json = JSON.stringify(lockVersion === null ? { payload } : { payload, lockVersion })
			if (options.keepalive && new TextEncoder().encode(json).length > KEEPALIVE_BODY_LIMIT_BYTES) return FAILED
			try {
				const response = await apiFetch(url, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: json,
					keepalive: options.keepalive,
				})
				if (!response.ok) return STATUS_RESULT[response.status] ?? FAILED
				const confirmed = readDraftLockVersion(await response.json().catch(() => null))
				return confirmed === null ? FAILED : { kind: 'ok', lockVersion: confirmed }
			} catch {
				return FAILED
			}
		},
		async readLockVersion() {
			try {
				const response = await apiFetch(url, { cache: 'no-store' })
				if (!response.ok) return null
				return readDraftLockVersion(await response.json().catch(() => null))
			} catch {
				return null
			}
		},
	}
}
