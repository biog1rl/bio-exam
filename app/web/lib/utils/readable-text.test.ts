import { describe, expect, it } from 'vitest'

import { DEFAULT_AVATAR_COLOR, contrastRatio, readableTextOn } from './readable-text'

describe('contrastRatio', () => {
	it('считает контраст по WCAG', () => {
		expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
		expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5)
		expect(contrastRatio('#ffffff', '#3b82f6')).toBeCloseTo(3.68, 2)
	})

	it('неразобранный цвет — null', () => {
		expect(contrastRatio('red', '#ffffff')).toBeNull()
		expect(contrastRatio('#12345', '#ffffff')).toBeNull()
	})
})

describe('readableTextOn', () => {
	it('запасной цвет аватара читается с белыми инициалами', () => {
		expect(readableTextOn(DEFAULT_AVATAR_COLOR)).toBe('#ffffff')
		expect(contrastRatio('#ffffff', DEFAULT_AVATAR_COLOR)).toBeGreaterThanOrEqual(4.5)
	})

	it('на светлом цвете инициалы тёмные', () => {
		expect(readableTextOn('#fde68a')).toBe('#182610')
		expect(readableTextOn('#3b82f6')).toBe('#182610')
	})

	it('на тёмном цвете инициалы белые', () => {
		expect(readableTextOn('#1e3a8a')).toBe('#ffffff')
	})

	it('неразобранный цвет — белые инициалы', () => {
		expect(readableTextOn('var(--primary)')).toBe('#ffffff')
	})
})
