import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { badgeLabel, bellAccessibleName, isInternalHref, titlePrefix, withTitlePrefix } from './format'

describe('badgeLabel', () => {
	test.each([
		[1, '1'],
		[9, '9'],
		[10, '9+'],
		[21, '9+'],
	])('%i -> %s', (count, expected) => {
		assert.equal(badgeLabel(count), expected)
	})
})

describe('bellAccessibleName', () => {
	test.each([
		[0, 'Уведомления'],
		[1, 'Уведомления, 1 непрочитанное'],
		[2, 'Уведомления, 2 непрочитанных'],
		[5, 'Уведомления, 5 непрочитанных'],
		[11, 'Уведомления, 11 непрочитанных'],
		[21, 'Уведомления, 21 непрочитанное'],
		[22, 'Уведомления, 22 непрочитанных'],
		[101, 'Уведомления, 101 непрочитанное'],
		[111, 'Уведомления, 111 непрочитанных'],
	])('%i -> %s', (count, expected) => {
		assert.equal(bellAccessibleName(count), expected)
	})
})

describe('titlePrefix', () => {
	test.each([
		[0, ''],
		[-1, ''],
		[1, '(1) '],
		[9, '(9) '],
		[10, '(9+) '],
	])('%i -> %j', (count, expected) => {
		assert.equal(titlePrefix(count), expected)
	})
})

describe('withTitlePrefix', () => {
	test.each([
		['Главная - Био', '(3) ', '(3) Главная - Био'],
		['(3) Главная - Био', '(9+) ', '(9+) Главная - Био'],
		['(9+) Главная - Био', '', 'Главная - Био'],
		['(9+) Главная - Био', '(9+) ', '(9+) Главная - Био'],
	])('%j с префиксом %j -> %j', (title, prefix, expected) => {
		assert.equal(withTitlePrefix(title, prefix), expected)
	})
})

describe('isInternalHref', () => {
	test.each([
		['/tests/a/b', true],
		['/', true],
		['//evil.example/x', false],
		['/\\evil.example', false],
		['https://evil.example', false],
		['javascript:alert(1)', false],
		['tests/a', false],
		['', false],
	])('%j -> %s', (href, expected) => {
		assert.equal(isInternalHref(href), expected)
	})
})
