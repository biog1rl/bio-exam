import type { SupabaseClient } from '@supabase/supabase-js'

import {
	StorageConflictError,
	StorageNotFoundError,
	StorageUnavailableError,
	type StorageAdapter,
	type StorageObject,
	type StorageReadResult,
	type WriteOptions,
} from '../port.js'

const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 100

type SupabaseStorageClient = Pick<SupabaseClient, 'storage'>

type ErrorShape = {
	name?: unknown
	status?: unknown
	statusCode?: unknown
	originalError?: { status?: unknown } | null
}

type RequestMode = 'download' | 'json'

type ListedEntry = {
	name: string
	id: string | null
	created_at?: string | null
	metadata?: Record<string, unknown> | null
}

function shape(error: unknown): ErrorShape {
	return error !== null && typeof error === 'object' ? (error as ErrorShape) : {}
}

function numericStatus(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isDownloadNotFound(error: unknown): boolean {
	const e = shape(error)
	const status = numericStatus(e.originalError?.status)
	return e.name === 'StorageUnknownError' && status !== null && [400, 404].includes(status)
}

function hasApiStatusCode(error: unknown, statusCode: string): boolean {
	const e = shape(error)
	return e.name === 'StorageApiError' && e.statusCode === statusCode
}

function isRetryable(error: unknown): boolean {
	const e = shape(error)
	const originalStatus = numericStatus(e.originalError?.status)
	const status = numericStatus(e.status)
	if (originalStatus !== null && originalStatus >= 500) return true
	if (status !== null && status >= 500) return true
	return originalStatus === null && status === null
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function urlPath(key: string): string {
	return key.split('/').map(encodeURIComponent).join('/')
}

function compareKeys(a: StorageObject, b: StorageObject): number {
	return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function createSupabaseAdapter({
	client,
	bucket,
	retries = 3,
	baseDelayMs = 500,
}: {
	client: SupabaseStorageClient
	bucket: string
	retries?: number
	baseDelayMs?: number
}): StorageAdapter {
	const files = () => client.storage.from(bucket)

	async function request<T>(
		mode: RequestMode,
		operation: () => Promise<T>,
		onNotFound: () => T = () => {
			throw new StorageUnavailableError()
		}
	): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await operation()
			} catch (error) {
				const notFound = mode === 'download' ? isDownloadNotFound(error) : hasApiStatusCode(error, '404')
				if (notFound) return onNotFound()
				if (mode === 'json' && hasApiStatusCode(error, '409')) throw new StorageConflictError()
				if (!isRetryable(error) || attempt >= retries) throw new StorageUnavailableError({ cause: error })
				const delay = baseDelayMs * Math.pow(2, attempt)
				console.warn(`[storage] Попытка ${attempt + 1} не удалась, повтор через ${delay}мс`)
				await sleep(delay)
			}
		}
	}

	async function copyOnce(from: string, to: string): Promise<void> {
		await request(
			'json',
			async () => {
				const { error } = await files().copy(from, to)
				if (error) throw error
			},
			() => {
				throw new StorageNotFoundError()
			}
		)
	}

	async function removeKeys(keys: string[]): Promise<void> {
		for (let i = 0; i < keys.length; i += REMOVE_BATCH_SIZE) {
			const batch = keys.slice(i, i + REMOVE_BATCH_SIZE)
			await request('json', async () => {
				const { error } = await files().remove(batch)
				if (error) throw error
			})
		}
	}

	async function listDirectory(prefix: string): Promise<ListedEntry[]> {
		const entries: ListedEntry[] = []
		for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
			const page = await request('json', async () => {
				const { data, error } = await files().list(prefix, {
					limit: LIST_PAGE_SIZE,
					offset,
					sortBy: { column: 'name', order: 'asc' },
				})
				if (error) throw error
				return (data ?? []) as ListedEntry[]
			})
			entries.push(...page)
			if (page.length < LIST_PAGE_SIZE) return entries
		}
	}

	async function collect(prefix: string, recursive: boolean, out: StorageObject[]): Promise<void> {
		for (const entry of await listDirectory(prefix)) {
			const key = `${prefix}/${entry.name}`
			if (entry.id === null) {
				if (recursive) await collect(key, recursive, out)
				continue
			}
			const metadata = entry.metadata ?? {}
			out.push({
				key,
				size: typeof metadata.size === 'number' ? metadata.size : 0,
				createdAt: entry.created_at ?? '',
				contentType: typeof metadata.mimetype === 'string' ? metadata.mimetype : 'application/octet-stream',
			})
		}
	}

	return {
		kind: 'supabase',

		async write(key: string, data: Buffer | string, options: WriteOptions): Promise<void> {
			await request('json', async () => {
				const { error } = await files().upload(urlPath(key), data, {
					contentType: options.contentType,
					upsert: options.upsert !== false,
					...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
				})
				if (error) throw error
			})
		},

		async read(key: string): Promise<StorageReadResult | null> {
			return request<StorageReadResult | null>(
				'download',
				async () => {
					const { data, error } = await files().download(urlPath(key))
					if (error) throw error
					return {
						data: Buffer.from(await data.arrayBuffer()),
						contentType: data.type || 'application/octet-stream',
					}
				},
				() => null
			)
		},

		async exists(key: string): Promise<boolean> {
			return request('download', async () => {
				const { data } = await files().exists(urlPath(key))
				return data === true
			})
		},

		async remove(keys: string[]): Promise<void> {
			await removeKeys(keys)
		},

		async copy(from: string, to: string): Promise<void> {
			try {
				await copyOnce(from, to)
			} catch (error) {
				if (!(error instanceof StorageConflictError)) throw error
				await removeKeys([to])
				await copyOnce(from, to)
			}
		},

		async list(prefix: string, options: { recursive: boolean }): Promise<StorageObject[]> {
			const out: StorageObject[] = []
			await collect(prefix, options.recursive, out)
			return out.sort(compareKeys)
		},

		publicUrl(key: string): string {
			return files().getPublicUrl(key).data.publicUrl
		},
	}
}
