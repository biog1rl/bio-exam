import assert from 'node:assert/strict'

import { getSessionCookieCandidates, readSessionCookieValue } from './sessionCookie'

assert.deepEqual(getSessionCookieCandidates(undefined), ['bio_exam_session', 'bio-exam_session'])
assert.deepEqual(getSessionCookieCandidates('custom_session'), [
	'custom_session',
	'bio_exam_session',
	'bio-exam_session',
])

const legacyCookieStore = {
	get(name: string) {
		if (name === 'bio-exam_session') return { value: 'legacy-token' }
		return undefined
	},
}
assert.equal(readSessionCookieValue(legacyCookieStore, 'bio_exam_session'), 'legacy-token')

const configuredCookieStore = {
	get(name: string) {
		if (name === 'custom_session') return { value: 'custom-token' }
		if (name === 'bio_exam_session') return { value: 'default-token' }
		return undefined
	},
}
assert.equal(readSessionCookieValue(configuredCookieStore, 'custom_session'), 'custom-token')
