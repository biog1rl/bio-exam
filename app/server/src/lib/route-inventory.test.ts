import express, { Router, type RequestHandler } from 'express'
import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

import { requirePerm, requirePermKey } from '../middleware/auth/requirePerm.js'
import { sessionOptional, sessionRequired } from '../middleware/auth/session.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { validateUUID } from '../middleware/validateParams.js'
import { nameMiddleware } from './middleware-name.js'
import { decodeMountPath, inventoryText, routeInventory } from './route-inventory.js'

vi.mock('../services/access-policy/index.js', () => ({ requestAccess: vi.fn() }))
vi.mock('../services/session/index.js', () => ({
	ACCESS_COOKIE: 'access',
	loadSessionUser: vi.fn(),
	readCookie: vi.fn(),
	verifyAccessToken: vi.fn(),
}))

function mountRegexp(path: string): { regexp: RegExp; keys: Array<{ name: string | number }> } {
	const app = express()
	app.use(path, Router())
	const stack = (app as unknown as { _router: { stack: Array<{ regexp: RegExp; keys: Array<{ name: string }> }> } })
		._router.stack
	const layer = stack[stack.length - 1]
	assert.ok(layer)
	return { regexp: layer.regexp, keys: layer.keys }
}

describe('nameMiddleware', () => {
	test('задаёт имя и возвращает ту же функцию', () => {
		const fn = (_a: unknown, _b: unknown, _c: unknown) => undefined
		const named = nameMiddleware(fn, 'x')
		assert.equal(named, fn)
		assert.equal(named.name, 'x')
		assert.equal(named.length, 3)
	})

	test('фабрики дают детерминированные имена', () => {
		assert.equal(requirePerm('tests', 'read').name, 'requirePerm(tests.read)')
		assert.equal(requirePermKey('users.edit').name, 'requirePermKey(users.edit)')
		assert.equal(validateUUID('testId').name, 'validateUUID(testId)')
		assert.equal(validateUUID().name, 'validateUUID(id)')
		assert.equal(sessionRequired().name, 'sessionRequired')
		assert.equal(sessionOptional().name, 'sessionOptional')
		assert.equal(
			rateLimiter({ maxAttempts: 5, windowMs: 60_000, keyPrefix: 'invite-accept' }).name,
			'rateLimiter(invite-accept,5/60000ms)'
		)
		assert.equal(rateLimiter().name, 'rateLimiter(-,5/60000ms)')
	})
})

describe('decodeMountPath', () => {
	test('восстанавливает путь монтирования из regexp слоя', () => {
		for (const path of ['/', '/api', '/tests/public', '/:testId/assignments', '/auth/refresh', '/docs/assets']) {
			const { regexp, keys } = mountRegexp(path)
			assert.equal(decodeMountPath(regexp, keys), path)
		}
	})

	test('незнакомая форма regexp — исключение с исходником', () => {
		const odd = /^\/a(?:b|c)\/?(?=\/|$)/i
		assert.throws(
			() => decodeMountPath(odd, []),
			(error: Error) => error.message.includes(odd.source)
		)
		const fromRegexp = mountRegexp('/x')
		assert.throws(
			() => decodeMountPath(/^\/x\/?$/i, fromRegexp.keys),
			(error: Error) => error.message.includes('^\\/x\\/?$')
		)
	})
})

describe('routeInventory', () => {
	test('маршруты, вложенный роутер с префиксом и параметром, слой use', () => {
		const app = express()
		const guard: RequestHandler = function guard(_req, _res, next) {
			next()
		}
		const nested = Router()
		nested.use(nameMiddleware((_req, _res, next) => next(), 'nestedUse'))
		nested.get('/', guard, (_req, res) => {
			res.end()
		})
		nested.get('/items/:itemId', validateUUID('itemId'), (_req, res) => {
			res.end()
		})
		nested
			.route('/multi')
			.get(guard)
			.post((_req, res) => {
				res.end()
			})
		const outer = Router()
		outer.use('/:testId/assignments', nested)
		app.use(guard)
		app.get('/healthz', (_req, res) => {
			res.end()
		})
		app.use('/api/tests', outer)

		const lines = routeInventory(app)
		const own = lines.filter((line) => !/^USE \/ (query|expressInit)$/.test(line))
		assert.deepEqual(own, [
			'USE / guard',
			'GET /healthz  <anonymous>',
			'USE /api/tests/:testId/assignments nestedUse',
			'GET /api/tests/:testId/assignments  guard > <anonymous>',
			'GET /api/tests/:testId/assignments/items/:itemId  validateUUID(itemId) > <anonymous>',
			'GET /api/tests/:testId/assignments/multi  guard',
			'POST /api/tests/:testId/assignments/multi  <anonymous>',
		])
		assert.equal(inventoryText(app), lines.join('\n') + '\n')
	})
})
