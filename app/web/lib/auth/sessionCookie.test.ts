import assert from 'node:assert/strict'
import { test } from 'vitest'

import { getSessionCookieCandidates, readSessionCookieValue } from './sessionCookie'

test('getSessionCookieCandidates: настроенное имя идёт первым, затем имена по умолчанию', () => {
	assert.deepEqual(getSessionCookieCandidates(undefined), ['bio_exam_session', 'bio-exam_session'])
	assert.deepEqual(getSessionCookieCandidates('custom_session'), [
		'custom_session',
		'bio_exam_session',
		'bio-exam_session',
	])
})

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
