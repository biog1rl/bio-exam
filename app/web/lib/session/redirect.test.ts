import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { buildLoginRedirect, isLoggedOutNotice, LOGGED_OUT_PATH, safeCallbackPath } from './redirect'

describe('уведомление о выходе', () => {
	test('после выхода ведёт на страницу входа с меткой', () => {
		assert.equal(LOGGED_OUT_PATH, '/login?loggedOut=1')
		assert.equal(isLoggedOutNotice(new URLSearchParams(LOGGED_OUT_PATH.split('?')[1])), true)
	})

	test('без метки уведомления нет', () => {
		assert.equal(isLoggedOutNotice(new URLSearchParams('')), false)
		assert.equal(isLoggedOutNotice(new URLSearchParams('callbackUrl=%2Fprofile')), false)
		assert.equal(isLoggedOutNotice(new URLSearchParams('loggedOut=0')), false)
	})
})

describe('buildLoginRedirect', () => {
	test('кодирует путь возврата в callbackUrl', () => {
		assert.equal(buildLoginRedirect('/profile/test-user'), '/login?callbackUrl=%2Fprofile%2Ftest-user')
		assert.equal(
			buildLoginRedirect('/admin/users/123?tab=roles'),
			'/login?callbackUrl=%2Fadmin%2Fusers%2F123%3Ftab%3Droles'
		)
	})
})

describe('safeCallbackPath', () => {
	for (const accepted of ['/dashboard?x=1#h', '/tests/biology/cell', '/%2F%2Fevil.example', '/dashboard']) {
		test(`принимает путь того же origin: ${JSON.stringify(accepted)}`, () => {
			assert.equal(safeCallbackPath(accepted), accepted)
		})
	}

	const rejected: (string | null | undefined)[] = [
		'//evil.example',
		'/\\evil.example',
		'/\\\\evil',
		'https://evil.example',
		'javascript:alert(1)',
		'%2F%2Fevil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'/dash\u0000board',
		'/dash\u007fboard',
		'/a\\b',
		'',
		null,
		undefined,
		'dashboard',
		'/.//evil.com',
		'/a/..//evil.com',
		'/%2e//evil.com/x',
		'/%2e%2e//evil.com/path',
		'/./\\evil.com',
	]
	for (const value of rejected) {
		test(`отклоняет ${JSON.stringify(value) ?? 'undefined'} и возвращает /dashboard`, () => {
			assert.equal(safeCallbackPath(value), '/dashboard')
		})
	}

	test('свой fallback', () => {
		assert.equal(safeCallbackPath('//evil.example', '/'), '/')
	})
})
