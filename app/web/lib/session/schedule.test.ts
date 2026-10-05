import assert from 'node:assert/strict'
import { test } from 'vitest'

import { refreshDelayMs } from './schedule'

const now = Date.parse('2026-10-04T10:00:00.000Z')

test('refreshDelayMs: 0, если до истечения меньше 60 с или срок прошёл', () => {
	assert.equal(refreshDelayMs('2026-10-04T10:00:30.000Z', now), 0)
	assert.equal(refreshDelayMs('2026-10-04T10:01:00.000Z', now), 0)
	assert.equal(refreshDelayMs('2026-10-04T09:00:00.000Z', now), 0)
})

test('refreshDelayMs: null без срока или с неразбираемой строкой', () => {
	assert.equal(refreshDelayMs(null, now), null)
	assert.equal(refreshDelayMs('not-a-date', now), null)
	assert.equal(refreshDelayMs('', now), null)
})
