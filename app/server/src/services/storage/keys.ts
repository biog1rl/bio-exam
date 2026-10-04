import { StorageKeyError } from './port.js'

export const STORAGE_NAMESPACES = ['images', 'topics', 'avatars'] as const

export type StorageNamespace = (typeof STORAGE_NAMESPACES)[number]

const MAX_DECODE_STEPS = 3
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const DRIVE_LETTER = /^[A-Za-z]:/
const URL_DELIMITERS = /[?#]|%2f|%5c/i
const SERVABLE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function decodingStages(input: string): string[] {
	const stages = [input]
	let current = input
	for (let step = 0; step < MAX_DECODE_STEPS; step++) {
		let decoded: string
		try {
			decoded = decodeURIComponent(current)
		} catch {
			break
		}
		if (decoded === current) break
		stages.push(decoded)
		current = decoded
	}
	return stages
}

function assertSafeStage(stage: string): void {
	if (stage.startsWith('/') || stage.startsWith('\\') || DRIVE_LETTER.test(stage)) throw new StorageKeyError()
	if (stage.includes('\\') || CONTROL_CHARACTERS.test(stage)) throw new StorageKeyError()
	if (URL_DELIMITERS.test(stage)) throw new StorageKeyError()
	for (const segment of stage.split('/')) {
		if (segment === '' || segment === '.' || segment === '..') throw new StorageKeyError()
	}
}

function isNamespace(value: string | undefined): value is StorageNamespace {
	return (STORAGE_NAMESPACES as readonly string[]).includes(value ?? '')
}

function checkPath(input: unknown, minSegments: number): string {
	if (typeof input !== 'string' || input === '') throw new StorageKeyError()
	for (const stage of decodingStages(input)) assertSafeStage(stage)
	const segments = input.split('/')
	if (!isNamespace(segments[0]) || segments.length < minSegments) throw new StorageKeyError()
	return input
}

export function normalizeKey(input: string): string {
	return checkPath(input, 2)
}

export function normalizePrefix(input: string): string {
	if (typeof input !== 'string') throw new StorageKeyError()
	const trimmed = input.endsWith('/') ? input.slice(0, -1) : input
	return checkPath(trimmed, 1)
}

function tryNormalizeKey(input: string): string | null {
	try {
		return normalizeKey(input)
	} catch {
		return null
	}
}

function extensionOf(key: string): string {
	const name = key.slice(key.lastIndexOf('/') + 1)
	const dot = name.lastIndexOf('.')
	return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function isServableImageKey(input: string): boolean {
	const key = tryNormalizeKey(input)
	if (key === null) return false
	if (!SERVABLE_IMAGE_EXTENSIONS.has(extensionOf(key))) return false
	const segments = key.split('/')
	if (segments[0] === 'images' || segments[0] === 'avatars') return true
	return segments[0] === 'topics' && segments.length >= 5 && segments[3] === 'assets'
}

export function isMediaLibraryKey(input: string): boolean {
	const key = tryNormalizeKey(input)
	if (key === null) return false
	const segments = key.split('/')
	return segments.length === 2 && segments[0] === 'images'
}
