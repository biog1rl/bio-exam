import { ApiError } from '../../lib/errors.js'

export type StorageObject = {
	key: string
	size: number
	createdAt: string
	contentType: string
}

export type WriteOptions = {
	contentType: string
	cacheControl?: string
	upsert?: boolean
}

export type StorageReadResult = { data: Buffer; contentType: string }

export type StorageAdapterKind = 'supabase' | 'local' | 'memory'

export interface StorageAdapter {
	readonly kind: StorageAdapterKind
	write(key: string, data: Buffer | string, options: WriteOptions): Promise<void>
	read(key: string): Promise<StorageReadResult | null>
	exists(key: string): Promise<boolean>
	remove(keys: string[]): Promise<void>
	copy(from: string, to: string): Promise<void>
	list(prefix: string, options: { recursive: boolean }): Promise<StorageObject[]>
	publicUrl?(key: string): string
}

export class StorageKeyError extends ApiError {
	constructor() {
		super(400, 'Некорректный путь в хранилище')
		this.name = 'StorageKeyError'
	}
}

export class StorageNotFoundError extends ApiError {
	constructor() {
		super(404, 'Объект не найден')
		this.name = 'StorageNotFoundError'
	}
}

export class StorageConflictError extends ApiError {
	constructor() {
		super(409, 'Объект уже существует')
		this.name = 'StorageConflictError'
	}
}

export class StorageUnavailableError extends ApiError {
	constructor(options?: { cause?: unknown }) {
		super(503, 'Хранилище недоступно')
		this.name = 'StorageUnavailableError'
		if (options?.cause !== undefined) this.cause = options.cause
	}
}

export class StorageConfigError extends ApiError {
	constructor(message: string) {
		super(500, message, false)
		this.name = 'StorageConfigError'
	}
}
