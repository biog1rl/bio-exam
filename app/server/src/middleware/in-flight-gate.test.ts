import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, test } from 'vitest'

import { inFlightGate } from './in-flight-gate.js'

function fakeResponse() {
	const res = new EventEmitter() as EventEmitter & {
		statusCode: number
		body: unknown
		headers: Record<string, string>
		setHeader(name: string, value: string): void
		status(code: number): typeof res
		json(body: unknown): typeof res
	}
	res.statusCode = 200
	res.headers = {}
	res.setHeader = (name, value) => {
		res.headers[name] = value
	}
	res.status = (code) => {
		res.statusCode = code
		return res
	}
	res.json = (body) => {
		res.body = body
		return res
	}
	return res
}

describe('inFlightGate', () => {
	test('сверх лимита отвечает 503 с Retry-After, после закрытия ответа место освобождается', () => {
		const gate = inFlightGate({ limit: 2, retryAfterSeconds: 5, message: 'занято' })
		const admitted = [fakeResponse(), fakeResponse()]
		let passed = 0
		for (const res of admitted) gate({} as never, res as never, () => (passed += 1))
		assert.equal(passed, 2)

		const refused = fakeResponse()
		gate({} as never, refused as never, () => (passed += 1))
		assert.equal(passed, 2)
		assert.equal(refused.statusCode, 503)
		assert.equal(refused.headers['Retry-After'], '5')
		assert.deepEqual(refused.body, { error: 'занято' })

		admitted[0]!.emit('close')
		admitted[0]!.emit('close')
		const retry = fakeResponse()
		gate({} as never, retry as never, () => (passed += 1))
		assert.equal(passed, 3)
		const stillFull = fakeResponse()
		gate({} as never, stillFull as never, () => (passed += 1))
		assert.equal(stillFull.statusCode, 503)
	})
})
