import archiver from 'archiver'

import { storage } from './index.js'

export type ZipEntry = { name: string; key: string } | { name: string; buffer: Buffer }

export type BuildZipOptions = { missing?: string[] }

export const MISSING_FILES_ENTRY = 'missing-files.txt'

export class ZipEntryNameError extends Error {
	constructor(name: string) {
		super(`buildZip: invalid entry name ${JSON.stringify(name)}`)
		this.name = 'ZipEntryNameError'
	}
}

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if (code < 0x20 || code === 0x7f) return true
	}
	return false
}

function assertEntryName(name: string): void {
	if (typeof name !== 'string' || name === '' || name.startsWith('/')) throw new ZipEntryNameError(name)
	if (name.includes('\\') || hasControlCharacter(name)) throw new ZipEntryNameError(name)
	for (const segment of name.split('/')) {
		if (segment === '' || segment === '.' || segment === '..') throw new ZipEntryNameError(name)
	}
}

function assertEntryNames(entries: ZipEntry[]): void {
	const names = new Set<string>([MISSING_FILES_ENTRY])
	for (const entry of entries) {
		assertEntryName(entry.name)
		if (names.has(entry.name)) throw new ZipEntryNameError(entry.name)
		names.add(entry.name)
	}
}

function packZip(files: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const archive = archiver('zip', { zlib: { level: 9 } })
		const chunks: Buffer[] = []
		archive.on('data', (chunk: Buffer) => chunks.push(chunk))
		archive.on('end', () => resolve(Buffer.concat(chunks)))
		archive.on('warning', reject)
		archive.on('error', reject)
		for (const file of files) archive.append(file.data, { name: file.name })
		void archive.finalize()
	})
}

export async function buildZip(entries: ZipEntry[], options: BuildZipOptions = {}): Promise<Buffer> {
	assertEntryNames(entries)
	const missing = options.missing ?? []
	const files: Array<{ name: string; data: Buffer }> = []
	let module: ReturnType<typeof storage> | null = null
	for (const entry of entries) {
		if ('buffer' in entry) {
			files.push({ name: entry.name, data: entry.buffer })
			continue
		}
		module ??= storage()
		const result = await module.read(entry.key)
		if (result === null) missing.push(entry.key)
		else files.push({ name: entry.name, data: result.data })
	}
	if (missing.length > 0) files.push({ name: MISSING_FILES_ENTRY, data: Buffer.from(`${missing.join('\n')}\n`) })
	return packZip(files)
}
