import express from 'express'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { describe, test } from 'vitest'

import { startTestServer } from '../test-support/http.js'
import { createHttpLogger, createLogger } from './logger.js'

const ACCESS_VALUE = 'eyJhbGciOiJIUzI1NiJ9.access-secret.signature'
const REFRESH_VALUE = 'refresh-secret-ed56b5e875f825e4552824e8b4f8e5c8'
const BEARER_VALUE = 'Bearer bearer-secret-token'
const UPLOAD_TOKEN_VALUE = 'Qm9vay1vZi1waG90by11cGxvYWQtdG9rZW4tdmFsdWUx'

function captureStream(): { stream: Writable; lines: () => Record<string, unknown>[]; raw: () => string } {
	const chunks: string[] = []
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(String(chunk))
			callback()
		},
	})
	const raw = () => chunks.join('')
	const lines = () =>
		raw()
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => JSON.parse(line) as Record<string, unknown>)
	return { stream, lines, raw }
}

describe('логгер: redact', () => {
	test('строка req.log.warn не содержит значения Cookie, Authorization и Set-Cookie', async () => {
		const capture = captureStream()
		const app = express()
		app.use(createHttpLogger(createLogger(capture.stream)))
		app.post('/api/auth/refresh', (req, res) => {
			res.setHeader('Set-Cookie', [`bio_exam_session=${ACCESS_VALUE}; Path=/`])
			req.log.warn({ event: 'refresh_replay' }, 'refresh token replay, session revoked')
			req.log.error({ res }, 'response logged')
			res.status(401).json({ error: 'unauthorized' })
		})
		const server = await startTestServer(app)
		try {
			const response = await fetch(`${server.baseUrl}/api/auth/refresh`, {
				method: 'POST',
				headers: {
					cookie: `bio_exam_session=${ACCESS_VALUE}; refresh_token=${REFRESH_VALUE}`,
					authorization: BEARER_VALUE,
				},
			})
			await response.text()
		} finally {
			await server.close()
		}

		const raw = capture.raw()
		for (const secret of [ACCESS_VALUE, REFRESH_VALUE, BEARER_VALUE]) {
			assert.equal(raw.includes(secret), false, `log contains ${secret}`)
		}
		const lines = capture.lines()
		const warn = lines.find((line) => line.event === 'refresh_replay')
		assert.ok(warn, 'no refresh_replay line')
		const headers = (warn.req as { headers: Record<string, unknown> }).headers
		assert.equal(headers.cookie, '[redacted]')
		assert.equal(headers.authorization, '[redacted]')
		const withRes = lines.find((line) => line.msg === 'response logged')
		assert.ok(withRes, 'no response line')
		const resHeaders = (withRes.res as { headers: Record<string, unknown> }).headers
		assert.equal(resHeaders['set-cookie'], '[redacted]')
	})

	test('заголовок X-Upload-Token в строке журнала скрыт', async () => {
		const capture = captureStream()
		const app = express()
		app.use(createHttpLogger(createLogger(capture.stream)))
		app.get('/api/upload/context', (req, res) => {
			req.log.warn({ event: 'upload_link_probe' }, 'upload link request')
			res.status(404).json({ error: 'invalid' })
		})
		const server = await startTestServer(app)
		try {
			const response = await fetch(`${server.baseUrl}/api/upload/context`, {
				headers: { 'x-upload-token': UPLOAD_TOKEN_VALUE },
			})
			await response.text()
		} finally {
			await server.close()
		}

		assert.equal(capture.raw().includes(UPLOAD_TOKEN_VALUE), false, 'log contains upload token')
		const line = capture.lines().find((item) => item.event === 'upload_link_probe')
		assert.ok(line, 'no upload_link_probe line')
		const headers = (line.req as { headers: Record<string, unknown> }).headers
		assert.equal(headers['x-upload-token'], '[redacted]')
	})
})
