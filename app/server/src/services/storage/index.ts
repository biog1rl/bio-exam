import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import path from 'node:path'

import { isIsolatedEnv } from '../../config/test-database-url.js'
import { createLocalAdapter } from './adapters/local.js'
import { memoryStorage } from './adapters/memory.js'
import { createSupabaseAdapter } from './adapters/supabase.js'
import { normalizeKey, normalizePrefix } from './keys.js'
import {
	StorageConfigError,
	type StorageAdapter,
	type StorageAdapterKind,
	type StorageObject,
	type StorageReadResult,
	type WriteOptions,
} from './port.js'

export {
	StorageConfigError,
	StorageConflictError,
	StorageKeyError,
	StorageNotFoundError,
	StorageUnavailableError,
	type StorageAdapter,
	type StorageAdapterKind,
	type StorageObject,
	type StorageReadResult,
	type WriteOptions,
} from './port.js'
export { isMediaLibraryKey, isServableImageKey, normalizeKey, normalizePrefix, STORAGE_NAMESPACES } from './keys.js'

export type StoragePage = { objects: StorageObject[]; total: number }

export type StorageModule = {
	readonly kind: StorageAdapterKind
	write(key: string, data: Buffer | string, options: WriteOptions): Promise<void>
	read(key: string): Promise<StorageReadResult | null>
	readText(key: string): Promise<string | null>
	exists(key: string): Promise<boolean>
	remove(keys: string[]): Promise<void>
	copy(from: string, to: string): Promise<void>
	list(prefix: string, options?: { recursive?: boolean }): Promise<StorageObject[]>
	listPage(prefix: string, options: { limit: number; offset: number }): Promise<StoragePage>
	publicUrl(key: string): string | null
}

const EMPTY_CONFIG_MESSAGE =
	'Хранилище не настроено: задайте STORAGE_DRIVER=local и STORAGE_LOCAL_DIR или SUPABASE_URL и SUPABASE_SERVICE_KEY'
const LOCAL_DIR_MESSAGE = 'STORAGE_LOCAL_DIR must be an absolute path'
const MEMORY_OUTSIDE_TESTS_MESSAGE = 'STORAGE_DRIVER=memory работает только в изолированном режиме тестов'
const SUPABASE_IN_ISOLATION_MESSAGE = 'Supabase Storage запрещён в изолированном режиме тестов'
const UNKNOWN_DRIVER_MESSAGE = 'Неизвестное значение STORAGE_DRIVER: допустимы local, supabase и memory'

export function resolveStorageDriver(): StorageAdapterKind {
	const driver = process.env.STORAGE_DRIVER ?? ''
	const isolated = isIsolatedEnv()

	if (driver === 'local') {
		const dir = process.env.STORAGE_LOCAL_DIR
		if (!dir || !path.isAbsolute(dir)) throw new StorageConfigError(LOCAL_DIR_MESSAGE)
		return 'local'
	}

	if (driver === 'memory') {
		if (isolated) return 'memory'
		throw new StorageConfigError(MEMORY_OUTSIDE_TESTS_MESSAGE)
	}

	if (driver === 'supabase' || driver === '') {
		if (isolated) {
			if (driver === '') return 'memory'
			throw new StorageConfigError(SUPABASE_IN_ISOLATION_MESSAGE)
		}
		if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) return 'supabase'
		throw new StorageConfigError(EMPTY_CONFIG_MESSAGE)
	}

	throw new StorageConfigError(UNKNOWN_DRIVER_MESSAGE)
}

function byCreatedAtDesc(a: StorageObject, b: StorageObject): number {
	if (a.createdAt === b.createdAt) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
	return a.createdAt < b.createdAt ? 1 : -1
}

export function createStorage(adapter: StorageAdapter): StorageModule {
	return {
		kind: adapter.kind,
		async write(key, data, options) {
			await adapter.write(normalizeKey(key), data, options)
		},
		async read(key) {
			return adapter.read(normalizeKey(key))
		},
		async readText(key) {
			const result = await adapter.read(normalizeKey(key))
			return result === null ? null : result.data.toString('utf8')
		},
		async exists(key) {
			return adapter.exists(normalizeKey(key))
		},
		async remove(keys) {
			const normalized = keys.map((key) => normalizeKey(key))
			if (normalized.length === 0) return
			await adapter.remove(normalized)
		},
		async copy(from, to) {
			const source = normalizeKey(from)
			const target = normalizeKey(to)
			await adapter.copy(source, target)
		},
		async list(prefix, options = {}) {
			return adapter.list(normalizePrefix(prefix), { recursive: options.recursive ?? false })
		},
		async listPage(prefix, options) {
			const all = (await adapter.list(normalizePrefix(prefix), { recursive: false })).sort(byCreatedAtDesc)
			return { objects: all.slice(options.offset, options.offset + options.limit), total: all.length }
		},
		publicUrl(key) {
			const normalized = normalizeKey(key)
			return adapter.publicUrl ? adapter.publicUrl(normalized) : null
		},
	}
}

let supabaseClientCache: { url: string; key: string; client: SupabaseClient } | null = null
let localAdapterCache: { root: string; adapter: StorageAdapter } | null = null

function supabaseClient(url: string, key: string): SupabaseClient {
	if (supabaseClientCache && supabaseClientCache.url === url && supabaseClientCache.key === key) {
		return supabaseClientCache.client
	}
	const client = createClient(url, key)
	supabaseClientCache = { url, key, client }
	return client
}

function localAdapter(root: string): StorageAdapter {
	if (localAdapterCache && localAdapterCache.root === root) return localAdapterCache.adapter
	const adapter = createLocalAdapter({ root })
	localAdapterCache = { root, adapter }
	return adapter
}

function selectAdapter(): StorageAdapter {
	const driver = resolveStorageDriver()
	if (driver === 'memory') return memoryStorage
	if (driver === 'local') return localAdapter(process.env.STORAGE_LOCAL_DIR ?? '')
	const client = supabaseClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_KEY ?? '')
	return createSupabaseAdapter({ client, bucket: process.env.SUPABASE_STORAGE_BUCKET || 'main' })
}

export function storage(): StorageModule {
	return createStorage(selectAdapter())
}

export function storageUrl(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(normalizeKey(key))}`
}
