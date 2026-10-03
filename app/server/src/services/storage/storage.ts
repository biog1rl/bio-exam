/**
 * Storage Service для работы с Supabase Storage
 * Если переменные окружения не установлены, операции записи пропускаются с предупреждением
 *
 * Локальный режим (D-18): STORAGE_DRIVER=local и абсолютный STORAGE_LOCAL_DIR. Все ключи хранятся
 * файлами внутри этого каталога, Supabase не используется. Публичный интерфейс класса не меняется.
 * Полный порт хранилища (ADR-0004) остаётся в Phase 7.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

import archiver from 'archiver'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { isIsolatedEnv } from '../../config/test-database-url.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'main'

let supabase: SupabaseClient | null = null
let configWarningShown = false

type UploadBufferOptions = {
	cacheControl?: string
	upsert?: boolean
}

function appendCacheNonce(url: string): string {
	const separator = url.includes('?') ? '&' : '?'
	return `${url}${separator}cacheNonce=${Date.now()}`
}

function isConfigured(): boolean {
	// Изолированный процесс не может дойти до Supabase, даже если переменные просочились в окружение (D-17)
	if (isIsolatedEnv()) return false
	return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
}

function showConfigWarning(): void {
	if (!configWarningShown) {
		console.warn('[StorageService] SUPABASE_URL and SUPABASE_SERVICE_KEY not set. Storage operations will be skipped.')
		configWarningShown = true
	}
}

function getClient(): SupabaseClient | null {
	// Изолированный (тестовый или e2e) процесс никогда не создаёт клиент Supabase (D-17),
	// и константы SUPABASE_* здесь даже не читаются
	if (isIsolatedEnv()) return null
	// Локальный режим (D-18) имеет приоритет над Supabase
	if (isLocalStorage()) return null
	if (!isConfigured()) {
		showConfigWarning()
		return null
	}
	if (!supabase) {
		supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
	}
	return supabase
}

// ---------------------------------------------------------------------------
// Локальный режим хранилища (D-18)
// ---------------------------------------------------------------------------

const LOCAL_TEMP_SUFFIX = /\.tmp-[0-9a-f]{12}$/

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.md': 'text/markdown',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.zip': 'application/zip',
}

/** Включён ли локальный режим (читается при каждом вызове, чтобы тесты могли менять окружение) */
function isLocalStorage(): boolean {
	return process.env.STORAGE_DRIVER === 'local'
}

function getLocalRoot(): string {
	const dir = process.env.STORAGE_LOCAL_DIR
	if (!dir || !path.isAbsolute(dir)) {
		throw new Error('STORAGE_LOCAL_DIR must be an absolute path')
	}
	return path.resolve(dir)
}

function localContentType(key: string): string {
	return CONTENT_TYPES_BY_EXTENSION[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

function unsupportedInLocal(method: string): Error {
	return new Error(`[StorageService] ${method} is not supported in local storage mode (ADR-0004, Phase 7)`)
}

function hasErrorCode(error: unknown, ...codes: string[]): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code
	return typeof code === 'string' && codes.includes(code)
}

/** Лежит ли target внутри base (или совпадает с ним). Сравнение через path.relative, не по префиксу строки */
function isInsideRoot(base: string, target: string): boolean {
	const rel = path.relative(base, target)
	if (rel === '') return true
	return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

function escapesRootError(): Error {
	return new Error('[StorageService] path escapes storage root')
}

/** Синтаксические проверки ключа до любого обращения к файловой системе */
function assertSafeLocalKey(key: string): void {
	if (typeof key !== 'string' || key === '' || key.includes('\0')) {
		throw new Error('[StorageService] invalid storage key')
	}
	if (key.startsWith('/') || key.startsWith('\\') || /^[A-Za-z]:/.test(key) || key.includes('\\')) {
		throw escapesRootError()
	}
	if (key.split('/').includes('..')) {
		throw escapesRootError()
	}
}

async function realpathOrNull(target: string): Promise<string | null> {
	try {
		return await fs.promises.realpath(target)
	} catch (e) {
		if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) return null
		throw e
	}
}

/**
 * Переводит ключ хранилища в абсолютный путь внутри STORAGE_LOCAL_DIR.
 * Отклоняет пустые ключи, NUL, абсолютные пути, сегменты `..` и выход за корень через symlink.
 * Для чтения реальный путь существующей цели обязан лежать под realpath(корня). Для записи под корнем
 * обязан лежать realpath самого глубокого существующего предка.
 * Литерал `%2e%2e` не декодируется и остаётся обычным именем.
 */
async function resolveLocalPath(key: string, { forWrite }: { forWrite: boolean }): Promise<string> {
	assertSafeLocalKey(key)

	const root = getLocalRoot()
	const abs = path.resolve(root, path.posix.normalize(key))
	const rel = path.relative(root, abs)
	if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
		throw escapesRootError()
	}

	if (forWrite) {
		await fs.promises.mkdir(root, { recursive: true })
		const rootReal = await fs.promises.realpath(root)
		let probe = abs
		for (;;) {
			const real = await realpathOrNull(probe)
			if (real !== null) {
				if (!isInsideRoot(rootReal, real)) throw escapesRootError()
				break
			}
			// Несуществующая цель: висячий symlink (мог бы указывать наружу) отклоняем, иначе поднимаемся к предку
			const link = await fs.promises.lstat(probe).catch(() => null)
			if (link) throw escapesRootError()
			const parent = path.dirname(probe)
			if (parent === probe) throw escapesRootError()
			probe = parent
		}
		return abs
	}

	const rootReal = await realpathOrNull(root)
	if (rootReal === null) return abs
	const real = await realpathOrNull(abs)
	if (real !== null && !isInsideRoot(rootReal, real)) throw escapesRootError()
	return abs
}

/** Атомарная запись: временный файл рядом с целью, затем rename */
async function localWrite(key: string, data: string | Buffer): Promise<void> {
	const abs = await resolveLocalPath(key, { forWrite: true })
	await fs.promises.mkdir(path.dirname(abs), { recursive: true })

	const tmp = `${abs}.tmp-${crypto.randomBytes(6).toString('hex')}`
	try {
		await fs.promises.writeFile(tmp, data)
		await fs.promises.rename(tmp, abs)
	} catch (e) {
		await fs.promises.unlink(tmp).catch(() => {})
		throw e
	}
}

/** Содержимое файла или null, если файла нет (или ключ указывает на каталог) */
async function localReadBuffer(key: string): Promise<Buffer | null> {
	const abs = await resolveLocalPath(key, { forWrite: false })
	try {
		return await fs.promises.readFile(abs)
	} catch (e) {
		if (hasErrorCode(e, 'ENOENT', 'ENOTDIR', 'EISDIR')) return null
		throw e
	}
}

async function localReadText(key: string): Promise<string | null> {
	const buffer = await localReadBuffer(key)
	return buffer === null ? null : buffer.toString('utf8')
}

/** Прямые записи каталога, отсортированные по имени; недописанные временные файлы скрыты */
async function localReadDir(abs: string): Promise<fs.Dirent[]> {
	try {
		const entries = await fs.promises.readdir(abs, { withFileTypes: true })
		return entries
			.filter((entry) => !LOCAL_TEMP_SUFFIX.test(entry.name))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
	} catch (e) {
		if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) return []
		throw e
	}
}

async function localExists(key: string): Promise<boolean> {
	const abs = await resolveLocalPath(key, { forWrite: false })
	try {
		return (await fs.promises.stat(abs)).isFile()
	} catch (e) {
		if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) return false
		throw e
	}
}

async function localListFiles(prefix: string): Promise<string[]> {
	const abs = await resolveLocalPath(prefix, { forWrite: false })
	const entries = await localReadDir(abs)
	return entries.map((entry) => `${prefix}/${entry.name}`)
}

/** Только файлы, symlink не раскрываются и не обходятся */
async function localListFilesRecursive(prefix: string): Promise<string[]> {
	const abs = await resolveLocalPath(prefix, { forWrite: false })
	const entries = await localReadDir(abs)

	const result: string[] = []
	for (const entry of entries) {
		const itemPath = `${prefix}/${entry.name}`
		if (entry.isDirectory()) {
			result.push(...(await localListFilesRecursive(itemPath)))
		} else if (entry.isFile()) {
			result.push(itemPath)
		}
	}
	return result
}

async function localDeleteFiles(paths: string[]): Promise<void> {
	for (const key of paths) {
		const abs = await resolveLocalPath(key, { forWrite: false })
		try {
			await fs.promises.unlink(abs)
		} catch (e) {
			if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) continue
			throw e
		}
	}
}

/** Удаляет пустые каталоги снизу вверх; непустые (rmdir падает) остаются нетронутыми */
async function removeEmptyDirs(abs: string): Promise<void> {
	let entries: fs.Dirent[]
	try {
		entries = await fs.promises.readdir(abs, { withFileTypes: true })
	} catch {
		return
	}
	for (const entry of entries) {
		if (entry.isDirectory()) await removeEmptyDirs(path.join(abs, entry.name))
	}
	await fs.promises.rmdir(abs).catch(() => {})
}

async function localDeleteDirectory(prefix: string): Promise<void> {
	const files = await localListFilesRecursive(prefix)
	await localDeleteFiles(files)
	await removeEmptyDirs(await resolveLocalPath(prefix, { forWrite: false }))
}

async function localMoveDirectory(oldPrefix: string, newPrefix: string): Promise<void> {
	// Оба префикса проверяются до первого перемещения: выход за корень не оставит половину файлов на месте
	const oldAbs = await resolveLocalPath(oldPrefix, { forWrite: false })
	await resolveLocalPath(newPrefix, { forWrite: true })

	const files = await localListFilesRecursive(oldPrefix)
	for (const filePath of files) {
		const newPath = newPrefix + filePath.slice(oldPrefix.length)
		const src = await resolveLocalPath(filePath, { forWrite: false })
		const dest = await resolveLocalPath(newPath, { forWrite: true })
		await fs.promises.mkdir(path.dirname(dest), { recursive: true })
		try {
			await fs.promises.rename(src, dest)
		} catch (e) {
			if (!hasErrorCode(e, 'EXDEV')) throw e
			await fs.promises.copyFile(src, dest)
			await fs.promises.unlink(src)
		}
	}
	await removeEmptyDirs(oldAbs)
}

export class StorageService {
	/**
	 * Проверяет, настроен ли Storage
	 */
	isConfigured(): boolean {
		return isConfigured()
	}

	/**
	 * Выполняет асинхронную функцию с логикой повторных попыток и экспоненциальной задержкой
	 * @param fn Асинхронная функция для выполнения
	 * @param retries Количество попыток повтора (по умолчанию: 3)
	 * @param baseDelayMs Базовая задержка в миллисекундах (по умолчанию: 500)
	 * @returns Результат выполнения функции
	 */
	async withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 500): Promise<T> {
		let lastError: Error | unknown

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				return await fn()
			} catch (e) {
				lastError = e
				if (attempt < retries) {
					const delay = baseDelayMs * Math.pow(2, attempt)
					console.warn(`[StorageService] Попытка ${attempt + 1} не удалась, повтор через ${delay}мс...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw lastError
	}

	/**
	 * Читает файл из Storage
	 * @param path Путь к файлу (относительно bucket)
	 * @returns Содержимое файла или пустую строку при ошибке
	 */
	async readFile(path: string): Promise<string> {
		if (isLocalStorage()) return (await localReadText(path)) ?? ''

		const client = getClient()
		if (!client) return ''

		try {
			const { data, error } = await client.storage.from(BUCKET).download(path)
			if (error) {
				console.error(`[StorageService] Error reading file ${path} from bucket "${BUCKET}":`, error)
				return ''
			}
			return await data.text()
		} catch (e) {
			console.error(`[StorageService] Exception reading file ${path}:`, e)
			return ''
		}
	}

	async downloadBuffer(path: string): Promise<{ buffer: Buffer; contentType: string }> {
		if (isLocalStorage()) {
			const buffer = await localReadBuffer(path)
			if (buffer === null) throw new Error(`[StorageService] File not found: ${path}`)
			return { buffer, contentType: localContentType(path) }
		}

		const client = getClient()
		if (!client) throw new Error('[StorageService] Cannot download: Supabase not configured')

		return this.withRetry(async () => {
			const { data, error } = await client.storage.from(BUCKET).download(path)
			if (error || !data) {
				throw error ?? new Error(`Failed to download ${path}`)
			}

			return {
				buffer: Buffer.from(await data.arrayBuffer()),
				contentType: data.type || 'application/octet-stream',
			}
		})
	}

	/**
	 * Читает несколько файлов параллельно с ограничением concurrency
	 * @param paths Массив путей к файлам
	 * @param concurrency Максимальное количество параллельных запросов (default: 5)
	 * @returns Map с путями файлов и их содержимым
	 */
	async readFilesParallel(paths: string[], concurrency = 5): Promise<Map<string, string>> {
		if (isLocalStorage()) {
			const found = new Map<string, string>()
			for (let i = 0; i < paths.length; i += concurrency) {
				const batch = paths.slice(i, i + concurrency)
				const contents = await Promise.all(batch.map((key) => localReadText(key)))
				batch.forEach((key, index) => {
					const content = contents[index]
					if (content !== null && content !== undefined) found.set(key, content)
				})
			}
			return found
		}

		const client = getClient()
		if (!client) return new Map()

		const result = new Map<string, string>()
		if (paths.length === 0) return result

		// Обрабатываем файлы пакетами для ограничения параллелизма
		for (let i = 0; i < paths.length; i += concurrency) {
			const batch = paths.slice(i, i + concurrency)
			const batchResults = await Promise.all(
				batch.map(async (path) => {
					try {
						const content = await this.readFile(path)
						return { path, content }
					} catch (e) {
						console.error(`[StorageService] Error reading file ${path}:`, e)
						return { path, content: '' }
					}
				})
			)

			for (const { path, content } of batchResults) {
				result.set(path, content)
			}
		}

		return result
	}

	/**
	 * Записывает файл в Storage (создаёт или перезаписывает)
	 * Включает автоматический retry с экспоненциальной задержкой
	 * @param path Путь к файлу (относительно bucket)
	 * @param content Содержимое файла
	 */
	async writeFile(path: string, content: string): Promise<void> {
		if (isLocalStorage()) return localWrite(path, content)

		const client = getClient()
		if (!client) {
			throw new Error('[StorageService] Cannot write: Supabase not configured')
		}

		await this.withRetry(async () => {
			const { error } = await client.storage.from(BUCKET).upload(path, content, {
				contentType: 'text/markdown',
				upsert: true,
			})

			if (error) {
				console.error(`[StorageService] FAILED to write file ${path}:`, error)
				throw new Error(`Storage error: ${error.message}`)
			}
		})
	}

	/** Upload a binary Buffer (image, etc.) to storage */
	async uploadBuffer(
		path: string,
		buffer: Buffer,
		contentType = 'application/octet-stream',
		options: UploadBufferOptions = {}
	): Promise<void> {
		if (isLocalStorage()) {
			if (options.upsert === false && (await localExists(path))) {
				throw new Error('Storage error: The resource already exists')
			}
			return localWrite(path, buffer)
		}

		const client = getClient()
		if (!client) {
			throw new Error('[StorageService] Cannot upload: Supabase not configured')
		}

		await this.withRetry(async () => {
			const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
				contentType,
				upsert: options.upsert ?? true,
				...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
			})

			if (error) {
				console.error(`[StorageService] FAILED to upload buffer ${path}:`, error)
				throw new Error(`Storage error: ${error.message}`)
			}
		})
	}

	/** Get public URL for a stored object (depends on bucket policy) */
	getPublicUrl(path: string): string {
		if (isLocalStorage()) throw unsupportedInLocal('getPublicUrl')

		const client = getClient()
		if (!client) return ''
		try {
			const res = client.storage.from(BUCKET).getPublicUrl(path)
			return res?.data?.publicUrl ?? ''
		} catch (e) {
			return ''
		}
	}

	/**
	 * Создаёт временный signed URL для доступа к файлу
	 * @param filePath Путь к файлу (относительно bucket)
	 * @param expiresIn TTL в секундах (по умолчанию: 3600)
	 * @returns Signed URL
	 */
	async createSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
		if (isLocalStorage()) throw unsupportedInLocal('createSignedUrl')

		const client = getClient()
		if (!client) throw new Error('[StorageService] Cannot create signed URL: Supabase not configured')
		const { data, error } = await client.storage.from(BUCKET).createSignedUrl(filePath, expiresIn)
		if (error) throw new Error(`Storage error: ${error.message}`)
		return appendCacheNonce(data.signedUrl)
	}

	/**
	 * Записывает JSON файл в Storage
	 * Включает автоматический retry с экспоненциальной задержкой
	 * @param path Путь к файлу (относительно bucket)
	 * @param data Данные для записи
	 */
	async writeJson(path: string, data: unknown): Promise<void> {
		if (isLocalStorage()) return localWrite(path, JSON.stringify(data, null, 2))

		const client = getClient()
		if (!client) {
			throw new Error('[StorageService] Cannot write JSON: Supabase not configured')
		}

		await this.withRetry(async () => {
			const { error } = await client.storage.from(BUCKET).upload(path, JSON.stringify(data, null, 2), {
				contentType: 'application/json',
				upsert: true,
			})

			if (error) {
				console.error(`[StorageService] FAILED to write JSON ${path}:`, error)
				throw new Error(`Storage error: ${error.message}`)
			}
		})
	}

	/**
	 * Читает JSON файл из Storage
	 * @param path Путь к файлу (относительно bucket)
	 * @returns Распарсенные данные или null при ошибке
	 */
	async readJson<T = unknown>(path: string): Promise<T | null> {
		if (isLocalStorage()) {
			// readFile вызывается вне try: ошибки ключа (выход за корень) не должны превращаться в null
			const content = await this.readFile(path)
			if (!content) return null
			try {
				return JSON.parse(content) as T
			} catch (e) {
				console.error(`Error parsing JSON from ${path}:`, e)
				return null
			}
		}

		try {
			const content = await this.readFile(path)
			if (!content) return null
			return JSON.parse(content) as T
		} catch (e) {
			console.error(`Error parsing JSON from ${path}:`, e)
			return null
		}
	}

	/**
	 * Удаляет файлы из Storage
	 * @param paths Массив путей к файлам
	 */
	async deleteFiles(paths: string[]): Promise<void> {
		if (paths.length === 0) return
		if (isLocalStorage()) return localDeleteFiles(paths)

		const client = getClient()
		if (!client) return

		const { error } = await client.storage.from(BUCKET).remove(paths)
		if (error) {
			console.error(`[StorageService] Error deleting files from bucket "${BUCKET}":`, error)
			throw new Error(`Storage error: ${error.message}`)
		}
	}

	/**
	 * Получает список файлов по prefix
	 * @param prefix Путь к директории
	 * @returns Массив путей к файлам
	 */
	async listFiles(prefix: string): Promise<string[]> {
		if (isLocalStorage()) return localListFiles(prefix)

		const client = getClient()
		if (!client) return []

		const { data, error } = await client.storage.from(BUCKET).list(prefix, { sortBy: { column: 'name', order: 'asc' } })
		if (error) {
			console.error(`Error listing files in ${prefix}:`, error.message)
			return []
		}
		return (data || []).map((f) => `${prefix}/${f.name}`)
	}

	/**
	 * Рекурсивно получает все файлы в директории
	 * @param prefix Путь к директории
	 * @returns Массив путей к файлам
	 */
	async listFilesRecursive(prefix: string): Promise<string[]> {
		if (isLocalStorage()) return localListFilesRecursive(prefix)

		const client = getClient()
		if (!client) return []

		const result: string[] = []
		const { data, error } = await client.storage.from(BUCKET).list(prefix, { sortBy: { column: 'name', order: 'asc' } })

		if (error || !data) return result

		for (const item of data) {
			const itemPath = prefix ? `${prefix}/${item.name}` : item.name
			if (item.id === null) {
				// Это директория
				const subFiles = await this.listFilesRecursive(itemPath)
				result.push(...subFiles)
			} else {
				result.push(itemPath)
			}
		}

		return result
	}

	/**
	 * Удаляет директорию рекурсивно
	 * @param prefix Путь к директории
	 */
	async deleteDirectory(prefix: string): Promise<void> {
		if (isLocalStorage()) return localDeleteDirectory(prefix)

		const files = await this.listFilesRecursive(prefix)
		if (files.length > 0) {
			await this.deleteFiles(files)
		}
	}

	/**
	 * Перемещает все файлы из одного префикса в другой
	 * Работает и для Supabase, и для локального дискового fallback
	 * @param oldPrefix старый префикс (например "topics/oldTopic/oldTest")
	 * @param newPrefix новый префикс
	 */
	async moveDirectory(oldPrefix: string, newPrefix: string): Promise<void> {
		if (!oldPrefix || !newPrefix) {
			throw new Error('[StorageService] moveDirectory: both oldPrefix and newPrefix are required')
		}

		// Локальный режим (D-18): свой корень с проверкой выхода за него. Устаревшая ветка ../web/public/uploads
		// ниже остаётся только для случая «ни локального режима, ни Supabase»
		if (isLocalStorage()) return localMoveDirectory(oldPrefix, newPrefix)

		const client = getClient()
		// Если настроен Supabase - работаем через API
		if (client) {
			// Получаем список всех файлов под oldPrefix
			const files = await this.listFilesRecursive(oldPrefix)
			if (files.length === 0) return // ничего перемещать

			// Скачиваем -> загружаем в новый путь
			for (const filePath of files) {
				const newPath = filePath.startsWith(oldPrefix)
					? newPrefix + filePath.slice(oldPrefix.length)
					: filePath.replace(oldPrefix, newPrefix)

				// Скачиваем с retry
				const { buffer, contentType } = await this.withRetry(async () => {
					const { data, error } = await client.storage.from(BUCKET).download(filePath)
					if (error || !data) {
						throw error ?? new Error(`Failed to download ${filePath}`)
					}
					const buf = Buffer.from(await (data as any).arrayBuffer())
					// Попробуем получить content-type из объекта data (Blob.type) если есть
					const ct = (data as any)?.type || 'application/octet-stream'
					return { buffer: buf, contentType: ct }
				})

				// Загружаем в новый путь (upsert)
				await this.uploadBuffer(newPath, buffer, contentType)
			}

			// После успешной копии удаляем старые
			await this.withRetry(async () => {
				await this.deleteFiles(files)
			})
			return
		}

		// Локальный диск: переводим пути в web/public/uploads
		// Преобразование: topics/{topic}/{test}/... -> web/public/uploads/tests/{topic}/{test}/...
		const files = await this.listFilesRecursive(oldPrefix)
		if (files.length === 0) return

		for (const storagePath of files) {
			const parts = storagePath.split('/')
			let relParts: string[]
			if (parts[0] === 'topics' && parts.length >= 3) {
				// topics/{topic}/{test}/...
				relParts = ['../web/public/uploads/tests', parts[1], parts[2], ...parts.slice(3)]
			} else {
				// generic fallback -> ../web/public/uploads/{...}
				relParts = ['../web/public/uploads', ...parts]
			}

			const src = path.join(process.cwd(), ...relParts)
			// Вычисляем destination по newPrefix
			const newStoragePath = storagePath.startsWith(oldPrefix)
				? newPrefix + storagePath.slice(oldPrefix.length)
				: storagePath.replace(oldPrefix, newPrefix)
			const newParts = newStoragePath.split('/')
			let destRelParts: string[]
			if (newParts[0] === 'topics' && newParts.length >= 3) {
				destRelParts = ['../web/public/uploads/tests', newParts[1], newParts[2], ...newParts.slice(3)]
			} else {
				destRelParts = ['../web/public/uploads', ...newParts]
			}
			const dest = path.join(process.cwd(), ...destRelParts)

			// Создаём папку назначения
			fs.mkdirSync(path.dirname(dest), { recursive: true })

			try {
				fs.renameSync(src, dest)
			} catch (e: any) {
				// Если переезд между устройствами - fallback: copy + unlink
				if (e && e.code === 'EXDEV') {
					fs.copyFileSync(src, dest)
					fs.unlinkSync(src)
				} else {
					throw new Error(`[StorageService] Failed to move local file ${src} -> ${dest}: ${e?.message || e}`)
				}
			}
		}
	}

	/**
	 * Создаёт ZIP архив из файлов в Storage
	 * @param basePath Базовый путь в Storage
	 * @param includeAnswers Включать ли файл с ответами
	 * @returns Buffer с ZIP архивом
	 */
	async createZip(basePath: string, includeAnswers: boolean = false): Promise<Buffer> {
		if (isLocalStorage()) throw unsupportedInLocal('createZip')

		const client = getClient()
		if (!client) {
			throw new Error('Storage not configured. Cannot create ZIP export.')
		}

		const files = await this.listFilesRecursive(basePath)

		return new Promise((resolve, reject) => {
			const archive = archiver('zip', { zlib: { level: 9 } })
			const chunks: Buffer[] = []

			archive.on('data', (chunk: Buffer) => chunks.push(chunk))
			archive.on('end', () => resolve(Buffer.concat(chunks)))
			archive.on('error', reject)

			const downloadAndAdd = async () => {
				for (const filePath of files) {
					// Пропускаем answer_keys.json если не нужны ответы
					if (!includeAnswers && filePath.endsWith('answer_keys.json')) {
						continue
					}

					const { data } = await client.storage.from(BUCKET).download(filePath)
					if (data) {
						const relativePath = filePath.replace(basePath + '/', '')
						const buffer = Buffer.from(await data.arrayBuffer())
						archive.append(buffer, { name: relativePath })
					}
				}
				archive.finalize()
			}

			downloadAndAdd().catch(reject)
		})
	}

	/**
	 * Проверяет существование файла
	 * @param path Путь к файлу
	 * @returns true если файл существует
	 */
	async exists(path: string): Promise<boolean> {
		if (isLocalStorage()) return localExists(path)

		const client = getClient()
		if (!client) return false

		const { data, error } = await client.storage.from(BUCKET).download(path)
		return !error && data !== null
	}

	/**
	 * Генерирует путь для вопроса
	 * @param topicSlug Slug темы
	 * @param testSlug Slug теста
	 * @param questionId ID вопроса
	 * @returns Базовый путь для файлов вопроса
	 */
	getQuestionPath(topicSlug: string, testSlug: string, questionId: string): string {
		return `topics/${topicSlug}/${testSlug}/questions/${questionId}`
	}

	/**
	 * Генерирует путь для теста
	 * @param topicSlug Slug темы
	 * @param testSlug Slug теста
	 * @returns Базовый путь для файлов теста
	 */
	getTestPath(topicSlug: string, testSlug: string): string {
		return `topics/${topicSlug}/${testSlug}`
	}

	/**
	 * Список файлов с метаданными (size, created_at) и поддержкой пагинации
	 * @param prefix Директория в bucket
	 * @param options Параметры пагинации и сортировки
	 * @returns Массив файлов с метаданными и общее количество
	 */
	async listFilesWithMeta(
		prefix: string,
		options: { limit?: number; offset?: number; sortBy?: { column: string; order: string } } = {}
	): Promise<{
		files: Array<{ name: string; id: string | null; metadata: Record<string, unknown>; created_at: string }>
		total: number
	}> {
		if (isLocalStorage()) throw unsupportedInLocal('listFilesWithMeta')

		const client = getClient()
		if (!client) return { files: [], total: 0 }

		const { limit = 20, offset = 0, sortBy = { column: 'created_at', order: 'desc' } } = options

		const { data, error } = await client.storage
			.from(BUCKET)
			.list(prefix, { limit, offset, sortBy: sortBy as { column: string; order: 'asc' | 'desc' } })

		if (error) {
			console.error(`[StorageService] Error listing files in ${prefix}:`, error)
			return { files: [], total: 0 }
		}

		const files = (data || []).filter((f) => f.id !== null) as Array<{
			name: string
			id: string | null
			metadata: Record<string, unknown>
			created_at: string
		}>

		// Отдельный запрос для подсчёта общего числа файлов (Supabase не предоставляет count API для storage)
		const { data: allData } = await client.storage
			.from(BUCKET)
			.list(prefix, { limit: 10000, sortBy: sortBy as { column: string; order: 'asc' | 'desc' } })
		const total = (allData || []).filter((f) => f.id !== null).length

		return { files, total }
	}
}

// Singleton экземпляр
export const storageService = new StorageService()
