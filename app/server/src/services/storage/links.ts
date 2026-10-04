import { storageUrl } from './index.js'
import { isServableImageKey, normalizeKey } from './keys.js'
import { StorageKeyError } from './port.js'

export type StorageLink = { kind: 'key'; key: string } | { kind: 'external'; url: string } | { kind: 'invalid' }

const INVALID: StorageLink = { kind: 'invalid' }
const HTTP_URL = /^https?:\/\//i
const SUPABASE_OBJECT_PATH = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
const PROXY_PATH = '/api/docs/assets/proxy'
const UPLOADS_PREFIX = 'uploads/'
const LEGACY_TESTS_PREFIX = 'tests/'

function ownBucket(): string {
	return process.env.SUPABASE_STORAGE_BUCKET || 'main'
}

function isOwnHost(host: string): boolean {
	const configured = process.env.SUPABASE_URL
	if (!configured) return true
	try {
		return new URL(configured).host === host
	} catch {
		return false
	}
}

function keyLink(candidate: string): StorageLink {
	try {
		return { kind: 'key', key: normalizeKey(candidate) }
	} catch {
		return INVALID
	}
}

function decodeOnce(value: string): string | null {
	try {
		return decodeURIComponent(value)
	} catch {
		return null
	}
}

function withoutQuery(value: string): string {
	const end = value.search(/[?#]/)
	return end === -1 ? value : value.slice(0, end)
}

function parseHttpUrl(input: string): StorageLink {
	let url: URL
	try {
		url = new URL(input)
	} catch {
		return INVALID
	}
	const match = SUPABASE_OBJECT_PATH.exec(url.pathname)
	if (!match || match[1] !== ownBucket() || !isOwnHost(url.host)) return { kind: 'external', url: input }
	const key = decodeOnce(match[2] ?? '')
	return key === null ? INVALID : keyLink(key)
}

function parseProxyUrl(input: string): StorageLink {
	let url: URL
	try {
		url = new URL(input, 'http://proxy.local')
	} catch {
		return INVALID
	}
	if (url.pathname !== PROXY_PATH) return INVALID
	const key = url.searchParams.get('path')
	return key ? keyLink(key) : INVALID
}

function parseUploadsPath(rest: string): StorageLink {
	const decoded = decodeOnce(withoutQuery(rest))
	if (decoded === null) return INVALID
	if (decoded.startsWith(LEGACY_TESTS_PREFIX)) return keyLink(`topics/${decoded.slice(LEGACY_TESTS_PREFIX.length)}`)
	return keyLink(decoded)
}

export function parseStorageLink(input: unknown): StorageLink {
	if (typeof input !== 'string') return INVALID
	const value = input.trim()
	if (value === '') return INVALID
	if (HTTP_URL.test(value)) return parseHttpUrl(value)
	if (value.startsWith(`${PROXY_PATH}?`) || value === PROXY_PATH) return parseProxyUrl(value)
	if (value.startsWith(`/${UPLOADS_PREFIX}`)) return parseUploadsPath(value.slice(UPLOADS_PREFIX.length + 1))
	if (value.startsWith(UPLOADS_PREFIX)) return parseUploadsPath(value.slice(UPLOADS_PREFIX.length))
	return keyLink(value)
}

export function resolveImageLink(input: unknown): string {
	const link = parseStorageLink(input)
	if (link.kind === 'external') return link.url
	if (link.kind === 'invalid' || !isServableImageKey(link.key)) throw new StorageKeyError()
	return storageUrl(link.key)
}

export function ownStorageKey(value: unknown): string | null {
	const link = parseStorageLink(value)
	return link.kind === 'key' ? link.key : null
}

export function avatarUrl(value: string | null | undefined): string | null {
	if (!value) return null
	const link = parseStorageLink(value)
	return link.kind === 'key' ? storageUrl(link.key) : value
}

export function storedAvatarValue(value: string | null | undefined): string | null {
	if (!value) return null
	const key = ownStorageKey(value)
	return key !== null && key.startsWith('avatars/') ? key : value
}
