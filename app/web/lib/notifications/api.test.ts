import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError } from '@/lib/http/request'

import { parseUnreadCount } from './api'

describe('parseUnreadCount', () => {
	test.each([
		[{ count: 0 }, 0],
		[{ count: 11 }, 11],
	])('%j -> %i', (body, expected) => {
		assert.equal(parseUnreadCount(body), expected)
	})

	test.each([[{ count: -1 }], [{ count: 1.5 }], [{ count: '3' }], [{}], [null], [[]]])(
		'%j -> MalformedBodyError',
		(body) => {
			assert.throws(() => parseUnreadCount(body), MalformedBodyError)
		}
	)
})
