import type { Pool } from 'pg'

export type PoolSnapshot = { queries: number; maxConcurrent: number }

export type PoolProbe = {
	reset(): void
	snapshot(): PoolSnapshot
	restore(): void
}

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
