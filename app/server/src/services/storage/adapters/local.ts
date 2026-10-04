import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
	StorageConflictError,
	StorageKeyError,
	StorageNotFoundError,
	type StorageAdapter,
	type StorageObject,
	type StorageReadResult,
	type WriteOptions,
} from '../port.js'

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

export function localContentType(key: string): string {
	return CONTENT_TYPES_BY_EXTENSION[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

function hasErrorCode(error: unknown, ...codes: string[]): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code
	return typeof code === 'string' && codes.includes(code)
}

function isInsideRoot(base: string, target: string): boolean {
	const rel = path.relative(base, target)
	if (rel === '') return true
	return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

function assertSafeLocalKey(key: string): void {
	if (typeof key !== 'string' || key === '' || key.includes('\0')) throw new StorageKeyError()
	if (key.startsWith('/') || key.startsWith('\\') || /^[A-Za-z]:/.test(key) || key.includes('\\')) {
		throw new StorageKeyError()
	}
	if (key.split('/').includes('..')) throw new StorageKeyError()
}

async function realpathOrNull(target: string): Promise<string | null> {
	try {
		return await fs.promises.realpath(target)
	} catch (e) {
		if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) return null
		throw e
	}
}

function tempPath(abs: string): string {
	return `${abs}.tmp-${crypto.randomBytes(6).toString('hex')}`
}

function byKey(a: StorageObject, b: StorageObject): number {
	return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function createLocalAdapter({ root: rootInput }: { root: string }): StorageAdapter {
	if (!path.isAbsolute(rootInput)) throw new Error('STORAGE_LOCAL_DIR must be an absolute path')
	const root = path.resolve(rootInput)

	async function resolveLocalPath(key: string, { forWrite }: { forWrite: boolean }): Promise<string> {
		assertSafeLocalKey(key)

		const abs = path.resolve(root, path.posix.normalize(key))
		const rel = path.relative(root, abs)
		if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
			throw new StorageKeyError()
		}

		if (forWrite) {
			await fs.promises.mkdir(root, { recursive: true })
			const rootReal = await fs.promises.realpath(root)
			let probe = abs
			for (;;) {
				const real = await realpathOrNull(probe)
				if (real !== null) {
					if (!isInsideRoot(rootReal, real)) throw new StorageKeyError()
					break
				}
				const link = await fs.promises.lstat(probe).catch(() => null)
				if (link) throw new StorageKeyError()
				const parent = path.dirname(probe)
				if (parent === probe) throw new StorageKeyError()
				probe = parent
			}
			return abs
		}

		const rootReal = await realpathOrNull(root)
		if (rootReal === null) return abs
		const real = await realpathOrNull(abs)
		if (real !== null && !isInsideRoot(rootReal, real)) throw new StorageKeyError()
		return abs
	}

	async function readDir(abs: string): Promise<fs.Dirent[]> {
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

	async function isFile(abs: string): Promise<boolean> {
		try {
			return (await fs.promises.stat(abs)).isFile()
		} catch (e) {
			if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) return false
			throw e
		}
	}

	async function pruneEmptyParents(abs: string): Promise<void> {
		let dir = path.dirname(abs)
		while (dir !== root && isInsideRoot(root, dir)) {
			try {
				await fs.promises.rmdir(dir)
			} catch {
				return
			}
			dir = path.dirname(dir)
		}
	}

	async function collect(prefix: string, abs: string, recursive: boolean, out: StorageObject[]): Promise<void> {
		for (const entry of await readDir(abs)) {
			const key = `${prefix}/${entry.name}`
			const entryAbs = path.join(abs, entry.name)
			if (entry.isDirectory()) {
				if (recursive) await collect(key, entryAbs, recursive, out)
				continue
			}
			if (!entry.isFile()) continue
			let stat: fs.Stats
			try {
				stat = await fs.promises.stat(entryAbs)
			} catch (e) {
				if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) continue
				throw e
			}
			const created = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime
			out.push({ key, size: stat.size, createdAt: created.toISOString(), contentType: localContentType(key) })
		}
	}

	return {
		kind: 'local',

		async write(key: string, data: Buffer | string, options: WriteOptions): Promise<void> {
			const abs = await resolveLocalPath(key, { forWrite: true })
			if (options.upsert === false && (await isFile(abs))) throw new StorageConflictError()
			await fs.promises.mkdir(path.dirname(abs), { recursive: true })
			const tmp = tempPath(abs)
			try {
				await fs.promises.writeFile(tmp, data)
				await fs.promises.rename(tmp, abs)
			} catch (e) {
				await fs.promises.unlink(tmp).catch(() => {})
				throw e
			}
		},

		async read(key: string): Promise<StorageReadResult | null> {
			const abs = await resolveLocalPath(key, { forWrite: false })
			try {
				return { data: await fs.promises.readFile(abs), contentType: localContentType(key) }
			} catch (e) {
				if (hasErrorCode(e, 'ENOENT', 'ENOTDIR', 'EISDIR')) return null
				throw e
			}
		},

		async exists(key: string): Promise<boolean> {
			return isFile(await resolveLocalPath(key, { forWrite: false }))
		},

		async remove(keys: string[]): Promise<void> {
			const targets: string[] = []
			for (const key of keys) targets.push(await resolveLocalPath(key, { forWrite: false }))
			for (const abs of targets) {
				try {
					await fs.promises.unlink(abs)
				} catch (e) {
					if (hasErrorCode(e, 'ENOENT', 'ENOTDIR')) continue
					throw e
				}
				await pruneEmptyParents(abs)
			}
		},

		async copy(from: string, to: string): Promise<void> {
			const source = await resolveLocalPath(from, { forWrite: false })
			const target = await resolveLocalPath(to, { forWrite: true })
			if (!(await isFile(source))) throw new StorageNotFoundError()
			await fs.promises.mkdir(path.dirname(target), { recursive: true })
			const tmp = tempPath(target)
			try {
				await fs.promises.copyFile(source, tmp)
				await fs.promises.rename(tmp, target)
			} catch (e) {
				await fs.promises.unlink(tmp).catch(() => {})
				if (hasErrorCode(e, 'ENOENT') && !(await isFile(source))) throw new StorageNotFoundError()
				throw e
			}
		},

		async list(prefix: string, options: { recursive: boolean }): Promise<StorageObject[]> {
			const abs = await resolveLocalPath(prefix, { forWrite: false })
			const out: StorageObject[] = []
			await collect(prefix, abs, options.recursive, out)
			return out.sort(byKey)
		},
	}
}
