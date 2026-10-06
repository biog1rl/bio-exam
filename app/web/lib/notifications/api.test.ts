import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError } from '@/lib/http/request'

import { parseNotificationsPage, parseOpenNotification, parseUnreadCount } from './api'

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

const item = {
	id: 'a',
	kind: 'test.assigned',
	text: 'Вам назначен тест',
	read: false,
	lastEventAt: '2026-10-06T10:00:00.000Z',
}

describe('parseNotificationsPage', () => {
	test.each([[{ items: [item], nextCursor: 'c1' }], [{ items: [], nextCursor: null }]])('%j parses', (body) => {
		assert.deepEqual(parseNotificationsPage(body), body)
	})

	test.each([
		[{ items: 'x', nextCursor: null }],
		[{ items: [{ ...item, text: undefined }], nextCursor: null }],
		[{ items: [{ ...item, read: 'false' }], nextCursor: null }],
		[{ items: [{ ...item, lastEventAt: 'вчера' }], nextCursor: null }],
		[{ items: [item], nextCursor: 5 }],
		[{ items: [item] }],
		[null],
	])('%j -> MalformedBodyError', (body) => {
		assert.throws(() => parseNotificationsPage(body), MalformedBodyError)
	})
})

describe('parseOpenNotification', () => {
	test('{ href } parses', () => {
		assert.deepEqual(parseOpenNotification({ href: '/tests/a/b' }), { href: '/tests/a/b' })
	})

	test.each([[{}], [{ href: 5 }], [null], [[]]])('%j -> MalformedBodyError', (body) => {
		assert.throws(() => parseOpenNotification(body), MalformedBodyError)
	})
})
