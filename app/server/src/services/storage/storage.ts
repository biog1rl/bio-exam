import archiver from 'archiver'

import { isIsolatedEnv } from '../../config/test-database-url.js'
import { resolveStorageDriver, storage, storageUrl } from './index.js'
import { normalizePrefix } from './keys.js'
import { StorageConfigError, StorageNotFoundError } from './port.js'

type UploadBufferOptions = {
	cacheControl?: string
	upsert?: boolean
}

type MetaFile = { name: string; id: string | null; metadata: Record<string, unknown>; created_at: string }

export function assertLegacyUploadsAllowed(): void {
	if (isIsolatedEnv()) {
		throw new Error('[storage] legacy web/public/uploads fallback is disabled in isolated mode')
	}
}

function lastSegment(key: string): string {
	return key.slice(key.lastIndexOf('/') + 1)
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const archive = archiver('zip', { zlib: { level: 9 } })
		const chunks: Buffer[] = []
		archive.on('data', (chunk: Buffer) => chunks.push(chunk))
		archive.on('end', () => resolve(Buffer.concat(chunks)))
		archive.on('error', reject)
		for (const entry of entries) archive.append(entry.data, { name: entry.name })
		void archive.finalize()
	})
}

export class StorageService {
	isConfigured(): boolean {
		try {
			resolveStorageDriver()
			return true
		} catch (error) {
			if (error instanceof StorageConfigError) return false
			throw error
		}
	}

	async readFile(path: string): Promise<string> {
		return (await storage().readText(path)) ?? ''
	}

	async downloadBuffer(path: string): Promise<{ buffer: Buffer; contentType: string }> {
		const result = await storage().read(path)
		if (result === null) throw new StorageNotFoundError()
		return { buffer: result.data, contentType: result.contentType }
	}

	async readFilesParallel(paths: string[], concurrency = 5): Promise<Map<string, string>> {
		const found = new Map<string, string>()
		if (paths.length === 0) return found
		const module = storage()
		const size = Math.max(1, concurrency)
		for (let i = 0; i < paths.length; i += size) {
			const batch = paths.slice(i, i + size)
			const contents = await Promise.all(batch.map((key) => module.readText(key)))
			batch.forEach((key, index) => {
				const content = contents[index]
				if (content !== null && content !== undefined) found.set(key, content)
			})
		}
		return found
	}

	async writeFile(path: string, content: string): Promise<void> {
		await storage().write(path, content, { contentType: 'text/markdown', upsert: true })
	}

	async uploadBuffer(
		path: string,
		buffer: Buffer,
		contentType = 'application/octet-stream',
		options: UploadBufferOptions = {}
	): Promise<void> {
		await storage().write(path, buffer, {
			contentType,
			upsert: options.upsert ?? true,
			...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
		})
	}

	getPublicUrl(path: string): string {
		return storageUrl(path)
	}

	async writeJson(path: string, data: unknown): Promise<void> {
		await storage().write(path, JSON.stringify(data, null, 2), { contentType: 'application/json', upsert: true })
	}

	async readJson<T = unknown>(path: string): Promise<T | null> {
		const content = await storage().readText(path)
		if (!content) return null
		return JSON.parse(content) as T
	}

	async deleteFiles(paths: string[]): Promise<void> {
		if (paths.length === 0) return
		await storage().remove(paths)
	}

	async listFiles(prefix: string): Promise<string[]> {
		return (await storage().list(prefix, { recursive: false })).map((object) => object.key)
	}

	async listFilesRecursive(prefix: string): Promise<string[]> {
		return (await storage().list(prefix, { recursive: true })).map((object) => object.key)
	}

	async deleteDirectory(prefix: string): Promise<void> {
		const module = storage()
		const keys = (await module.list(prefix, { recursive: true })).map((object) => object.key)
		if (keys.length > 0) await module.remove(keys)
	}

	async moveDirectory(oldPrefix: string, newPrefix: string): Promise<void> {
		if (!oldPrefix || !newPrefix) {
			throw new Error('[StorageService] moveDirectory: both oldPrefix and newPrefix are required')
		}
		const from = normalizePrefix(oldPrefix)
		const to = normalizePrefix(newPrefix)
		const module = storage()
		const keys = (await module.list(from, { recursive: true })).map((object) => object.key)
		if (keys.length === 0) return
		for (const key of keys) {
			await module.copy(key, to + key.slice(from.length))
		}
		await module.remove(keys)
	}

	async createZip(basePath: string, includeAnswers: boolean = false): Promise<Buffer> {
		const module = storage()
		const keys = (await module.list(basePath, { recursive: true })).map((object) => object.key)
		const entries: Array<{ name: string; data: Buffer }> = []
		for (const key of keys) {
			if (!includeAnswers && key.endsWith('answer_keys.json')) continue
			const result = await module.read(key)
			if (result === null) continue
			const name = key.startsWith(`${basePath}/`) ? key.slice(basePath.length + 1) : key
			entries.push({ name, data: result.data })
		}
		return buildZip(entries)
	}

	async exists(path: string): Promise<boolean> {
		return storage().exists(path)
	}

	getQuestionPath(topicSlug: string, testSlug: string, questionId: string): string {
		return `topics/${topicSlug}/${testSlug}/questions/${questionId}`
	}

	getTestPath(topicSlug: string, testSlug: string): string {
		return `topics/${topicSlug}/${testSlug}`
	}

	async listFilesWithMeta(
		prefix: string,
		options: { limit?: number; offset?: number; sortBy?: { column: string; order: string } } = {}
	): Promise<{ files: MetaFile[]; total: number }> {
		const { limit = 20, offset = 0 } = options
		const page = await storage().listPage(prefix, { limit, offset })
		return {
			files: page.objects.map((object) => ({
				name: lastSegment(object.key),
				id: object.key,
				metadata: { size: object.size, mimetype: object.contentType },
				created_at: object.createdAt,
			})),
			total: page.total,
		}
	}
}

export const storageService = new StorageService()
