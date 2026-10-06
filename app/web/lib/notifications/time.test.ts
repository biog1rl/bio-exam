import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { formatNotificationFullDate, formatNotificationTime } from './time'

const now = new Date(2026, 9, 20, 14, 5, 0)

function at(year: number, month: number, day: number, hour: number, minute: number, second = 0): string {
	return new Date(year, month, day, hour, minute, second).toISOString()
}

describe('formatNotificationTime', () => {
	test.each([
		[at(2026, 9, 20, 14, 5), 'только что'],
		[at(2026, 9, 20, 14, 10), 'только что'],
		[at(2026, 9, 20, 14, 4, 30), 'только что'],
		[at(2026, 9, 20, 14, 4), '1 мин назад'],
		[at(2026, 9, 20, 13, 30), '35 мин назад'],
		[at(2026, 9, 20, 13, 6), '59 мин назад'],
		[at(2026, 9, 20, 12, 5), '2 ч назад'],
		[at(2026, 9, 20, 0, 30), '13 ч назад'],
		[at(2026, 9, 19, 23, 30), 'вчера в 23:30'],
		[at(2026, 9, 18, 10, 0), '2 дн. назад'],
		[at(2026, 9, 14, 10, 0), '6 дн. назад'],
		[at(2026, 9, 13, 10, 0), '13 окт.'],
		[at(2026, 9, 6, 14, 5), '6 окт.'],
		[at(2025, 9, 6, 14, 5), '6 окт. 2025'],
	])('%s -> %s', (iso, expected) => {
		assert.equal(formatNotificationTime(iso, now), expected)
	})
})

describe('formatNotificationFullDate', () => {
	test('writes day, month name, year and time', () => {
		assert.equal(formatNotificationFullDate(at(2026, 9, 6, 14, 5)), '6 октября 2026, 14:05')
	})
})
