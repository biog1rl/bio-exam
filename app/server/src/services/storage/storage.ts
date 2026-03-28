/**
 * Storage Service для работы с Supabase Storage
 * Если переменные окружения не установлены, операции записи пропускаются с предупреждением
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

import fs from 'fs'
import path from 'path'

import archiver from 'archiver'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'main'

let supabase: SupabaseClient | null = null
let configWarningShown = false

function isConfigured(): boolean {
	return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)
}

function showConfigWarning(): void {
	if (!configWarningShown) {
		console.warn('[StorageService] SUPABASE_URL and SUPABASE_SERVICE_KEY not set. Storage operations will be skipped.')
		configWarningShown = true
	}
}

function getClient(): SupabaseClient | null {
	if (!isConfigured()) {
		showConfigWarning()
		return null
	}
	if (!supabase) {
		supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
	}
	return supabase
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

	/**
	 * Читает несколько файлов параллельно с ограничением concurrency
	 * @param paths Массив путей к файлам
	 * @param concurrency Максимальное количество параллельных запросов (default: 5)
	 * @returns Map с путями файлов и их содержимым
	 */
	async readFilesParallel(paths: string[], concurrency = 5): Promise<Map<string, string>> {
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
	async uploadBuffer(path: string, buffer: Buffer, contentType = 'application/octet-stream'): Promise<void> {
		const client = getClient()
		if (!client) {
			throw new Error('[StorageService] Cannot upload: Supabase not configured')
		}

		await this.withRetry(async () => {
			const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
				contentType,
				upsert: true,
			})

			if (error) {
				console.error(`[StorageService] FAILED to upload buffer ${path}:`, error)
				throw new Error(`Storage error: ${error.message}`)
			}
		})
	}

	/** Get public URL for a stored object (depends on bucket policy) */
	getPublicUrl(path: string): string {
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
		const client = getClient()
		if (!client) throw new Error('[StorageService] Cannot create signed URL: Supabase not configured')
		const { data, error } = await client.storage.from(BUCKET).createSignedUrl(filePath, expiresIn)
		if (error) throw new Error(`Storage error: ${error.message}`)
		return data.signedUrl
	}

	/**
	 * Записывает JSON файл в Storage
	 * Включает автоматический retry с экспоненциальной задержкой
	 * @param path Путь к файлу (относительно bucket)
	 * @param data Данные для записи
	 */
	async writeJson(path: string, data: unknown): Promise<void> {
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
}

// Singleton экземпляр
export const storageService = new StorageService()
