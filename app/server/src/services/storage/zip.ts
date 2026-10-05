import archiver from 'archiver'
import { finished, Writable } from 'node:stream'

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

export const ZIP_READ_AHEAD = 4

export class ZipLimitExceededError extends Error {
	readonly limitBytes: number

	constructor(limitBytes: number) {
		super(`streamZip: archive exceeds ${limitBytes} bytes`)
		this.name = 'ZipLimitExceededError'
		this.limitBytes = limitBytes
	}
}

export type StreamZipOptions = {
	missing?: string[]
	signal?: AbortSignal
	readAhead?: number
	onRead?: (key: string, bytes: number) => void
}

export type StreamZipResult = { bytes: number; missing: string[] }

export type CeilingBuffer = { writable: Writable; buffer(): Buffer; peakBytes(): number }

export function createCeilingBuffer(limitBytes: number): CeilingBuffer {
	let chunks: Buffer[] = []
	let total = 0
	let peak = 0
	let exceeded = false
	const writable = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			total += chunk.length
			peak = Math.max(peak, total)
			if (total > limitBytes) {
				exceeded = true
				chunks = []
				callback(new ZipLimitExceededError(limitBytes))
				return
			}
			chunks.push(chunk)
			callback()
		},
	})
	return {
		writable,
		buffer() {
			if (exceeded) throw new ZipLimitExceededError(limitBytes)
			return Buffer.concat(chunks, total)
		},
		peakBytes: () => peak,
	}
}

type ReadOutcome = { ok: true; data: Buffer | null } | { ok: false; error: unknown }

function abortError(signal: AbortSignal): unknown {
	if (signal.reason instanceof Error && signal.reason.name === 'AbortError') return signal.reason
	return new DOMException('streamZip: aborted', { name: 'AbortError', cause: signal.reason })
}

export function streamZip(
	entries: ZipEntry[],
	sink: NodeJS.WritableStream,
	options: StreamZipOptions = {}
): Promise<StreamZipResult> {
	try {
		assertEntryNames(entries)
	} catch (error) {
		return Promise.reject(error)
	}
	const { signal, onRead } = options
	if (signal?.aborted) return Promise.reject(abortError(signal))
	const requested = options.readAhead ?? ZIP_READ_AHEAD
	const readAhead = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : ZIP_READ_AHEAD
	const missing = options.missing ?? []
	const outcomes: Array<Promise<ReadOutcome> | undefined> = []
	const archive = archiver('zip', { zlib: { level: 9 } })
	let module: ReturnType<typeof storage> | null = null
	let started = 0
	let processed = 0
	let stopped = false
	let wake: (() => void) | null = null

	let settle!: { resolve(result: StreamZipResult): void; reject(error: unknown): void }
	const result = new Promise<StreamZipResult>((resolve, reject) => {
		settle = { resolve, reject }
	})

	function notify(): void {
		const waiter = wake
		wake = null
		waiter?.()
	}

	function onAbort(): void {
		if (signal) fail(abortError(signal))
	}

	function stop(): void {
		stopped = true
		signal?.removeEventListener('abort', onAbort)
		notify()
	}

	function fail(error: unknown): void {
		if (stopped) return
		stop()
		archive.unpipe(sink as NodeJS.WritableStream & Writable)
		archive.abort()
		archive.resume()
		settle.reject(error)
	}

	function readEntry(entry: ZipEntry): Promise<ReadOutcome> {
		if ('buffer' in entry) return Promise.resolve({ ok: true, data: entry.buffer })
		module ??= storage()
		const reader = module
		return (async (): Promise<ReadOutcome> => {
			const found = await reader.read(entry.key)
			if (found === null) return { ok: true, data: null }
			if (!stopped) onRead?.(entry.key, found.data.length)
			return { ok: true, data: found.data }
		})().catch((error: unknown): ReadOutcome => ({ ok: false, error }))
	}

	function fill(): void {
		while (!stopped && started < entries.length && started - processed < readAhead) {
			const entry = entries[started] as ZipEntry
			outcomes[started] = readEntry(entry)
			started += 1
		}
	}

	function progress(): void {
		processed += 1
		fill()
		notify()
	}

	async function waitForSlot(index: number): Promise<void> {
		fill()
		while (!stopped && started <= index) {
			await new Promise<void>((resolve) => {
				wake = resolve
			})
			fill()
		}
	}

	async function pump(): Promise<void> {
		for (let index = 0; index < entries.length; index += 1) {
			await waitForSlot(index)
			if (stopped) return
			const outcome = await (outcomes[index] as Promise<ReadOutcome>)
			outcomes[index] = undefined
			if (stopped) return
			if (!outcome.ok) {
				fail(outcome.error)
				return
			}
			const entry = entries[index] as ZipEntry
			if (outcome.data === null) {
				missing.push((entry as { key: string }).key)
				progress()
				continue
			}
			archive.append(outcome.data, { name: entry.name })
		}
		if (missing.length > 0) archive.append(Buffer.from(`${missing.join('\n')}\n`), { name: MISSING_FILES_ENTRY })
		archive.finalize().catch(() => undefined)
	}

	archive.on('entry', progress)
	archive.on('error', fail)
	archive.on('warning', fail)
	sink.on('error', fail)
	finished(sink, (error) => {
		if (error) {
			fail(error)
			return
		}
		if (stopped) return
		stop()
		settle.resolve({ bytes: archive.pointer(), missing })
	})
	signal?.addEventListener('abort', onAbort, { once: true })
	archive.pipe(sink)
	pump().catch(fail)
	return result
}
