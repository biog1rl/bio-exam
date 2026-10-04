import type { PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'
import { describe, expect, test } from 'vitest'

import { createAccessScope, type AccessScope } from './scope-rules.js'

const req = {} as Request

function scopeWith(granted: PermissionKey[]) {
	const asked: PermissionKey[] = []
	const scope = createAccessScope(async (_req, key) => {
		asked.push(key)
		return granted.includes(key)
	})
	return { scope, asked }
}

describe('createAccessScope', () => {
	test.each([
		{ name: 'canReadTest', key: 'tests.read', call: (s: AccessScope) => s.canReadTest(req, 't1') },
		{ name: 'canWriteTest', key: 'tests.write', call: (s: AccessScope) => s.canWriteTest(req, 't1') },
		{ name: 'canWriteTopic', key: 'tests.write', call: (s: AccessScope) => s.canWriteTopic(req, 'p1') },
		{ name: 'canReadUser', key: 'users.read', call: (s: AccessScope) => s.canReadUser(req, 'u1') },
		{ name: 'canReviewAttempt', key: 'tests.read', call: (s: AccessScope) => s.canReviewAttempt(req, 'a1') },
	] as const)('$name разрешает только при $key', async ({ key, call }) => {
		const allowed = scopeWith([key])
		expect(await call(allowed.scope)).toBe(true)
		expect(allowed.asked).toEqual([key])

		const denied = scopeWith([])
		expect(await call(denied.scope)).toBe(false)
	})

	test('testScope при tests.read — все тесты', async () => {
		const { scope } = scopeWith(['tests.read'])
		expect(await scope.testScope(req)).toEqual({ all: true })
	})

	test('testScope без tests.read — пустой список тем', async () => {
		const { scope } = scopeWith(['tests.write', 'users.read'])
		expect(await scope.testScope(req)).toEqual({ all: false, topicIds: [] })
	})

	test('ошибка проверки прав пробрасывается, доступ не выдаётся', async () => {
		const scope = createAccessScope(async () => {
			throw new Error('grants unavailable')
		})
		await expect(scope.canReadTest(req, 't1')).rejects.toThrow('grants unavailable')
		await expect(scope.testScope(req)).rejects.toThrow('grants unavailable')
	})
})
