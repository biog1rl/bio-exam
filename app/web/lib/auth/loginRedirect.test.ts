import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildLoginRedirectPath } from './loginRedirect'

test('buildLoginRedirectPath: кодирует путь возврата в callbackUrl', () => {
	assert.equal(buildLoginRedirectPath('/profile/test-user'), '/login?callbackUrl=%2Fprofile%2Ftest-user')
	assert.equal(
		buildLoginRedirectPath('/admin/users/123?tab=roles'),
		'/login?callbackUrl=%2Fadmin%2Fusers%2F123%3Ftab%3Droles'
	)
})
