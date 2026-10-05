import { describe, expect, it } from 'vitest'

import { effectiveGroup, parseUsersGroup, usersUrl } from './users-url'

describe('usersUrl и parseUsersGroup', () => {
	it('без группы — список без параметров', () => {
		expect(usersUrl(null)).toBe('/admin/users')
		expect(parseUsersGroup(new URLSearchParams())).toBeNull()
		expect(parseUsersGroup(new URLSearchParams('group=%20'))).toBeNull()
	})

	it('группа кодируется в адресе и читается обратно', () => {
		expect(usersUrl('g 1')).toBe('/admin/users?group=g%201')
		expect(parseUsersGroup(new URL(usersUrl('g 1'), 'http://x').searchParams)).toBe('g 1')
		expect(parseUsersGroup(new URLSearchParams(`group=${'x'.repeat(201)}`))).toBeNull()
	})
})

describe('effectiveGroup', () => {
	const groups = [{ id: 'g-1' }, { id: 'g-2' }]

	it('пока группы не загружены, верит адресу', () => {
		expect(effectiveGroup('g-9', undefined)).toBe('g-9')
	})

	it('группа зрителя остаётся, чужая или устаревшая сбрасывается', () => {
		expect(effectiveGroup('g-2', groups)).toBe('g-2')
		expect(effectiveGroup('g-9', groups)).toBeNull()
		expect(effectiveGroup(null, groups)).toBeNull()
	})
})
