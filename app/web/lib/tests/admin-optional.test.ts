import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { RequestError, type RequestFailure, type RequestOutcome } from '@/lib/http/request'

import { optionalAdminData } from './admin-optional'

function failure(kind: RequestFailure['kind'], status?: number): RequestFailure {
	const value: RequestFailure = { ok: false, kind, message: 'причина' }
	if (status !== undefined) value.status = status
	return value
}

function thrown(outcome: RequestOutcome<unknown>): unknown {
	try {
		optionalAdminData(outcome)
	} catch (error) {
		return error
	}
	return undefined
}

describe('optionalAdminData', () => {
	test('успех отдаёт данные', () => {
		assert.deepEqual(optionalAdminData({ ok: true, status: 200, data: { topics: [] } }), { topics: [] })
	})

	test('auth, http 401 и http 403 — null', () => {
		assert.equal(optionalAdminData(failure('auth')), null)
		assert.equal(optionalAdminData(failure('http', 401)), null)
		assert.equal(optionalAdminData(failure('http', 403)), null)
	})

	test('http 500, network и malformed бросают RequestError', () => {
		for (const outcome of [failure('http', 500), failure('network'), failure('malformed', 200)]) {
			const error = thrown(outcome)
			assert.ok(error instanceof RequestError)
			assert.equal(error.kind, outcome.ok ? undefined : outcome.kind)
			assert.equal(error.message, 'причина')
		}
	})
})
