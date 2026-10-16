import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { requestedTimeZone, utcOffsetOf } from './activity-time-zone.js'

describe('часовой пояс активности', () => {
	test.each([
		['Asia/Saigon', '2026-10-17T00:00:00Z', '+07:00'],
		['UTC', '2026-10-17T00:00:00Z', '+00:00'],
		['Asia/Kolkata', '2026-10-17T00:00:00Z', '+05:30'],
		['Europe/Berlin', '2026-01-15T00:00:00Z', '+01:00'],
		['Europe/Berlin', '2026-07-15T00:00:00Z', '+02:00'],
		['America/St_Johns', '2026-01-15T00:00:00Z', '-03:30'],
	])('%s на %s → %s', (zone, at, offset) => {
		assert.equal(utcOffsetOf(zone, new Date(at)), offset)
	})

	test.each([
		[undefined, 'UTC'],
		['Not/AZone', 'UTC'],
		["Asia/Saigon'; drop", 'UTC'],
		['Asia/Saigon', 'Asia/Saigon'],
	])('запрошенный пояс %s → %s', (value, expected) => {
		assert.equal(requestedTimeZone(value), expected)
	})
})
