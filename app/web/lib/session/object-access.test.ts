import assert from 'node:assert/strict'
import { test } from 'vitest'

import { objectAccess, type ObjectAccess } from './object-access'

test.each<[number, ObjectAccess]>([
	[200, 'ok'],
	[403, 'denied'],
	[404, 'missing'],
	[500, 'error'],
	[401, 'error'],
	[502, 'error'],
	[204, 'error'],
])('objectAccess(%i) → %s', (status, expected) => {
	assert.equal(objectAccess(status), expected)
})
