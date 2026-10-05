import assert from 'node:assert/strict'
import { test } from 'vitest'

import { readSessionCookieValue } from './sessionCookie'

test('readSessionCookieValue: читает устаревшее имя cookie', () => {
	const legacyCookieStore = {
		get(name: string) {
			if (name === 'bio-exam_session') return { value: 'legacy-token' }
			return undefined
		},
	}
	assert.equal(readSessionCookieValue(legacyCookieStore, 'bio_exam_session'), 'legacy-token')
})

test('readSessionCookieValue: настроенное имя cookie приоритетнее имени по умолчанию', () => {
	const configuredCookieStore = {
		get(name: string) {
			if (name === 'custom_session') return { value: 'custom-token' }
			if (name === 'bio_exam_session') return { value: 'default-token' }
			return undefined
		},
	}
	assert.equal(readSessionCookieValue(configuredCookieStore, 'custom_session'), 'custom-token')
})
