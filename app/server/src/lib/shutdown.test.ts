import express from 'express'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, test, vi } from 'vitest'

import { createShutdown } from './shutdown.js'

type Deferred = { promise: Promise<void>; resolve: () => void }

function deferred(): Deferred {
	let resolve!: () => void
	const promise = new Promise<void>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
	const startedAt = Date.now()
	return new Promise((resolve, reject) => {
		const poll = () => {
			if (check()) return resolve()
			if (Date.now() - startedAt > timeoutMs) return reject(new Error('waitFor timed out'))
			setTimeout(poll, 5)
		}
		poll()
	})
}

type Harness = {
	server: Server
	baseUrl: string
	events: string[]
	release: Deferred
	requestStarted: () => boolean
}

const servers: Server[] = []
const releases: Deferred[] = []

async function startHarness(): Promise<Harness> {
	const events: string[] = []
	const release = deferred()
	releases.push(release)
	let started = false
	const app = express()
	app.get('/slow', async (_req, res) => {
		started = true
		res.on('finish', () => events.push('response sent'))
		await release.promise
		res.status(200).send('ok')
	})
	const server = createServer(app)
	servers.push(server)
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const { port } = server.address() as AddressInfo
	return { server, baseUrl: `http://127.0.0.1:${port}`, events, release, requestStarted: () => started }
}

function fakeLog() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

afterEach(() => {
	for (const release of releases.splice(0)) release.resolve()
	for (const server of servers.splice(0)) {
		server.closeAllConnections()
		server.close()
	}
})

describe('createShutdown', () => {
	test('отвечает на запрос в полёте, отклоняет новое соединение и закрывает пул последним', async () => {
		const harness = await startHarness()
		const jobsStopped = deferred()
		const jobs = {
			stop: vi.fn(async () => {
				await jobsStopped.promise
				harness.events.push('jobs stopped')
			}),
		}
		const pool = { end: vi.fn(async () => void harness.events.push('pool end')) }
		const exit = vi.fn()
		const shutdown = createShutdown({
			server: harness.server,
			jobs,
			pool,
			drainMs: 5000,
			log: fakeLog(),
			exit,
			reapIntervalMs: 20,
		})

		const inFlight = fetch(`${harness.baseUrl}/slow`)
		await waitFor(harness.requestStarted)
		const done = shutdown('SIGTERM')

		await assert.rejects(fetch(`${harness.baseUrl}/slow`))
		jobsStopped.resolve()
		await waitFor(() => harness.events.includes('jobs stopped'))
		assert.equal(pool.end.mock.calls.length, 0)

		harness.release.resolve()
		const response = await inFlight
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'ok')
		await done

		assert.equal(pool.end.mock.calls.length, 1)
		assert.deepEqual(harness.events, ['jobs stopped', 'response sent', 'pool end'])
		assert.deepEqual(exit.mock.calls, [[0]])
	})

	test('задачи, которые останавливаются позже ответа, задерживают закрытие пула', async () => {
		const harness = await startHarness()
		const jobsStopped = deferred()
		const jobs = {
			stop: vi.fn(async () => {
				await jobsStopped.promise
				harness.events.push('jobs stopped')
			}),
		}
		const pool = { end: vi.fn(async () => void harness.events.push('pool end')) }
		const exit = vi.fn()
		const shutdown = createShutdown({
			server: harness.server,
			jobs,
			pool,
			drainMs: 5000,
			log: fakeLog(),
			exit,
			reapIntervalMs: 20,
		})

		const inFlight = fetch(`${harness.baseUrl}/slow`)
		await waitFor(harness.requestStarted)
		const done = shutdown('SIGTERM')
		harness.release.resolve()
		assert.equal((await inFlight).status, 200)
		await new Promise((resolve) => setTimeout(resolve, 100))
		assert.equal(pool.end.mock.calls.length, 0)
		assert.equal(exit.mock.calls.length, 0)

		jobsStopped.resolve()
		await done
		assert.deepEqual(harness.events, ['response sent', 'jobs stopped', 'pool end'])
		assert.deepEqual(exit.mock.calls, [[0]])
	})

	test('по пределу обрывает оставшиеся соединения, закрывает пул и выходит с 0', async () => {
		const harness = await startHarness()
		const closeAll = vi.spyOn(harness.server, 'closeAllConnections')
		const pool = { end: vi.fn(async () => undefined) }
		const exit = vi.fn()
		const log = fakeLog()
		const shutdown = createShutdown({
			server: harness.server,
			jobs: { stop: async () => undefined },
			pool,
			drainMs: 200,
			log,
			exit,
			reapIntervalMs: 20,
		})

		const inFlight = fetch(`${harness.baseUrl}/slow`).then(
			() => 'answered',
			() => 'aborted'
		)
		await waitFor(harness.requestStarted)
		await shutdown('SIGTERM')

		assert.equal(closeAll.mock.calls.length, 1)
		assert.equal(pool.end.mock.calls.length, 1)
		assert.deepEqual(exit.mock.calls, [[0]])
		assert.ok(log.warn.mock.calls.some(([data]) => (data as { drainMs?: number }).drainMs === 200))
		assert.equal(await inFlight, 'aborted')
	})

	test('второй сигнал до завершения первого выходит с 1 сразу', async () => {
		const harness = await startHarness()
		const jobsStopped = deferred()
		const pool = { end: vi.fn(async () => undefined) }
		const exit = vi.fn()
		const shutdown = createShutdown({
			server: harness.server,
			jobs: { stop: () => jobsStopped.promise },
			pool,
			drainMs: 5000,
			log: fakeLog(),
			exit,
			reapIntervalMs: 20,
		})

		const first = shutdown('SIGTERM')
		await shutdown('SIGINT')
		assert.deepEqual(exit.mock.calls, [[1]])
		assert.equal(pool.end.mock.calls.length, 0)

		jobsStopped.resolve()
		await first
		assert.deepEqual(exit.mock.calls, [[1], [0]])
	})
})
