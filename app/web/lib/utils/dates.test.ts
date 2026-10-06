import { describe, expect, it } from 'vitest'

import { formatDateTime, formatDay, formatPeriod, NO_DATE } from './dates'

describe('dates', () => {
	it.each([[null], [undefined], [''], ['not-a-date']])('пустая или битая дата %s -> прочерк', (value) => {
		expect(formatDay(value)).toBe(NO_DATE)
		expect(formatDateTime(value)).toBe(NO_DATE)
	})

	it('день и время в одном формате для любой строки ISO', () => {
		expect(formatDay('2026-10-06T09:05:00')).toBe('06.10.2026')
		expect(formatDateTime('2026-10-06T09:05:00')).toBe('06.10.2026, 09:05')
	})

	it.each([
		['2026-10-01', '2026-10-06', '01.10.26 — 06.10.26'],
		['2026-10-01', null, '01.10.26'],
		['2026-10-06', '2026-10-06', '06.10.26'],
		[null, '2026-10-06', ''],
	])('период %s — %s -> %s', (from, to, label) => {
		expect(formatPeriod(from, to)).toBe(label)
	})
})
