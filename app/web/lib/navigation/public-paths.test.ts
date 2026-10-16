import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { isAnonymousPage, isPublicPath } from './public-paths'

describe('isPublicPath', () => {
	test.each<[string, boolean]>([
		['/login', true],
		['/login?callbackUrl=%2Fdashboard', true],
		['/invite/abc', true],
		['/photo-upload', true],
		['/photo-upload?x=1', true],
		['/photo-upload#token', true],
		['/invites', false],
		['/users', false],
		['/photo-upload-x', false],
		['/photo-upload/abc', false],
		['/loginx', false],
		['/', false],
	])('%s → %s', (path, expected) => {
		assert.equal(isPublicPath(path), expected)
	})
})

describe('isAnonymousPage', () => {
	test.each<[string, boolean]>([
		['/photo-upload', true],
		['/photo-upload?x=1', true],
		['/photo-upload/abc', false],
		['/photo-upload-x', false],
		['/login', false],
		['/invite/abc', false],
	])('%s → %s', (path, expected) => {
		assert.equal(isAnonymousPage(path), expected)
	})
})
