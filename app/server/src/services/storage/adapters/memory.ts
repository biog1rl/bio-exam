import {
	StorageConflictError,
	StorageNotFoundError,
	StorageUnavailableError,
	type StorageAdapter,
	type StorageObject,
	type StorageReadResult,
	type WriteOptions,
} from '../port.js'

export type MemoryFailureOp = 'write' | 'read' | 'copy' | 'remove' | 'list'

export type MemoryFailure = {
	op: MemoryFailureOp
	key?: string
	prefix?: string
	times?: number
}

export type MemoryStoredObject = { data: Buffer; contentType: string; createdAt: string }

export type MemoryStorageAdapter = StorageAdapter & {
	readonly kind: 'memory'
	failOn(failure: MemoryFailure): void
	clearFailures(): void
	reset(): void
	put(key: string, data: Buffer | string, contentType?: string): void
	get(key: string): MemoryStoredObject | null
	keys(prefix?: string): string[]
}

function underPrefix(key: string, prefix: string): boolean {
	return prefix === '' || key.startsWith(`${prefix}/`)
}

function byKey(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

export function createMemoryAdapter(): MemoryStorageAdapter {
	const objects = new Map<string, MemoryStoredObject>()
	let failures: Array<MemoryFailure & { remaining: number | null }> = []
	let lastTimestamp = 0

	function timestamp(): string {
		lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
		return new Date(lastTimestamp).toISOString()
	}

	function store(key: string, data: Buffer | string, contentType: string): void {
		objects.set(key, { data: Buffer.from(data), contentType, createdAt: timestamp() })
	}

	function matches(failure: MemoryFailure, candidate: string): boolean {
		if (failure.key === undefined && failure.prefix === undefined) return true
		if (failure.key !== undefined && failure.key === candidate) return true
		if (failure.prefix !== undefined && (candidate === failure.prefix || underPrefix(candidate, failure.prefix))) {
			return true
		}
		return false
	}

	function maybeFail(op: MemoryFailureOp, candidates: string[]): void {
		const index = failures.findIndex(
			(failure) => failure.op === op && candidates.some((candidate) => matches(failure, candidate))
		)
		if (index === -1) return
		const failure = failures[index]
		if (failure && failure.remaining !== null) {
			failure.remaining -= 1
			if (failure.remaining <= 0) failures.splice(index, 1)
		}
		throw new StorageUnavailableError()
	}

	function toObject(key: string, object: MemoryStoredObject): StorageObject {
		return { key, size: object.data.length, createdAt: object.createdAt, contentType: object.contentType }
	}

	return {
		kind: 'memory',

		async write(key: string, data: Buffer | string, options: WriteOptions): Promise<void> {
			maybeFail('write', [key])
			if (options.upsert === false && objects.has(key)) throw new StorageConflictError()
			store(key, data, options.contentType)
		},

		async read(key: string): Promise<StorageReadResult | null> {
			maybeFail('read', [key])
			const object = objects.get(key)
			if (!object) return null
			return { data: Buffer.from(object.data), contentType: object.contentType }
		},

		async exists(key: string): Promise<boolean> {
			maybeFail('read', [key])
			return objects.has(key)
		},

		async remove(keys: string[]): Promise<void> {
			maybeFail('remove', keys)
			for (const key of keys) objects.delete(key)
		},

		async copy(from: string, to: string): Promise<void> {
			maybeFail('copy', [from, to])
			const source = objects.get(from)
			if (!source) throw new StorageNotFoundError()
			store(to, source.data, source.contentType)
		},

		async list(prefix: string, options: { recursive: boolean }): Promise<StorageObject[]> {
			maybeFail('list', [prefix])
			const result: StorageObject[] = []
			for (const key of [...objects.keys()].sort(byKey)) {
				if (!underPrefix(key, prefix)) continue
				const rest = prefix === '' ? key : key.slice(prefix.length + 1)
				if (!options.recursive && rest.includes('/')) continue
				const object = objects.get(key)
				if (object) result.push(toObject(key, object))
			}
			return result
		},

		failOn(failure: MemoryFailure): void {
			failures.push({ ...failure, remaining: failure.times ?? null })
		},

		clearFailures(): void {
			failures = []
		},

		reset(): void {
			objects.clear()
			failures = []
		},

		put(key: string, data: Buffer | string, contentType = 'application/octet-stream'): void {
			store(key, data, contentType)
		},

		get(key: string): MemoryStoredObject | null {
			const object = objects.get(key)
			if (!object) return null
			return { data: Buffer.from(object.data), contentType: object.contentType, createdAt: object.createdAt }
		},

		keys(prefix?: string): string[] {
			const all = [...objects.keys()].sort(byKey)
			return prefix === undefined ? all : all.filter((key) => key === prefix || underPrefix(key, prefix))
		},
	}
}

export const memoryStorage = createMemoryAdapter()
