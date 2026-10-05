import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import type { Pool } from 'pg'

import type { StorageAdapter } from '../../services/storage/port.js'

export type PoolSnapshot = { queries: number; maxConcurrent: number }

export type PoolProbe = {
	reset(): void
	snapshot(): PoolSnapshot
	restore(): void
}

export type StorageSnapshot = { reads: number; readBytes: number; maxConcurrent: number }

export type StorageProbe = {
	setReadDelay(ms: number): void
	reset(): void
	snapshot(): StorageSnapshot
	restore(): void
}

export type MemorySample = { baselineBytes: number; peakBytes: number; peakDeltaBytes: number }

export type MemorySampler = { stop(): MemorySample }

type AnyFunction = (...args: unknown[]) => unknown

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

export function instrumentPool(pgPool: Pool): PoolProbe {
	const target = pgPool as unknown as { query: AnyFunction }
	const original = target.query
	let queries = 0
	let inFlight = 0
	let maxConcurrent = 0

	const finish = () => {
		inFlight -= 1
	}

	target.query = function instrumentedQuery(this: unknown, ...args: unknown[]): unknown {
		queries += 1
		inFlight += 1
		maxConcurrent = Math.max(maxConcurrent, inFlight)
		const last = args.length > 0 ? args[args.length - 1] : undefined
		if (typeof last === 'function') {
			const callback = last as AnyFunction
			args[args.length - 1] = (...callbackArgs: unknown[]) => {
				finish()
				return callback(...callbackArgs)
			}
			return original.apply(this, args)
		}
		let result: unknown
		try {
			result = original.apply(this, args)
		} catch (error) {
			finish()
			throw error
		}
		if (isThenable(result)) {
			return Promise.resolve(result).finally(finish)
		}
		finish()
		return result
	}

	return {
		reset() {
			queries = 0
			maxConcurrent = inFlight
		},
		snapshot() {
			return { queries, maxConcurrent }
		},
		restore() {
			target.query = original
		},
	}
}

function delay(ms: number): Promise<void> {
	return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

export function instrumentStorage(adapter: StorageAdapter, options: { readDelayMs: number }): StorageProbe {
	const original = adapter.read.bind(adapter)
	let readDelayMs = options.readDelayMs
	let reads = 0
	let readBytes = 0
	let inFlight = 0
	let maxConcurrent = 0

	adapter.read = async (key: string) => {
		reads += 1
		inFlight += 1
		maxConcurrent = Math.max(maxConcurrent, inFlight)
		try {
			await delay(readDelayMs)
			const result = await original(key)
			if (result !== null) readBytes += result.data.length
			return result
		} finally {
			inFlight -= 1
		}
	}

	return {
		setReadDelay(ms: number) {
			readDelayMs = ms
		},
		reset() {
			reads = 0
			readBytes = 0
			maxConcurrent = inFlight
		},
		snapshot() {
			return { reads, readBytes, maxConcurrent }
		},
		restore() {
			adapter.read = original
		},
	}
}

let collector: (() => void) | null | undefined

export function collectGarbage(): void {
	if (collector === undefined) {
		try {
			setFlagsFromString('--expose_gc')
			const gc = runInNewContext('gc') as unknown
			collector = typeof gc === 'function' ? (gc as () => void) : null
		} catch {
			collector = null
		}
	}
	collector?.()
}

export async function settleMemory(rounds = 3, pauseMs = 25): Promise<void> {
	for (let round = 0; round < rounds; round += 1) {
		collectGarbage()
		await delay(pauseMs)
	}
}

export function sampleMemory(intervalMs: number): MemorySampler {
	const baselineBytes = process.memoryUsage().arrayBuffers
	let peakBytes = baselineBytes
	const read = () => {
		peakBytes = Math.max(peakBytes, process.memoryUsage().arrayBuffers)
	}
	const timer = setInterval(read, intervalMs)
	return {
		stop() {
			read()
			clearInterval(timer)
			return { baselineBytes, peakBytes, peakDeltaBytes: peakBytes - baselineBytes }
		},
	}
}

export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
	return sorted[rank - 1] ?? 0
}

export function round(value: number, digits = 2): number {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}
