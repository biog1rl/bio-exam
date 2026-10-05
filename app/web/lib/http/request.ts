import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import { failureMessage } from './errors'

export { AuthExpiredError }

export type RequestFailureKind = 'auth' | 'http' | 'malformed' | 'network' | 'aborted'

export type RequestFailure = {
	ok: false
	kind: RequestFailureKind
	status?: number
	message: string
	body?: unknown
}

export type RequestOutcome<T> = { ok: true; status: number; data: T } | RequestFailure

export type RequestOptions<T> = {
	method?: string
	json?: unknown
	body?: FormData
	signal?: AbortSignal
	keepalive?: boolean
	headers?: Record<string, string>
	cache?: RequestCache
	parse?: (body: unknown) => T
	fallbackMessage?: string
}

export type BlobRequestOptions = RequestOptions<never> & { filename: string }

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export class MalformedBodyError extends Error {
	constructor(message = 'Malformed response body') {
		super(message)
		this.name = 'MalformedBodyError'
	}
}

export class RequestError extends Error {
	readonly kind: RequestFailureKind
	readonly status?: number
	readonly body?: unknown

	constructor(failure: RequestFailure) {
		super(failure.message)
		this.name = 'RequestError'
		this.kind = failure.kind
		this.status = failure.status
		this.body = failure.body
	}
}

type FailureDraft = Omit<RequestFailure, 'ok' | 'message'>

function fail(draft: FailureDraft, fallback?: string): RequestFailure {
	const failure: RequestFailure = { ok: false, ...draft, message: '' }
	failure.message = failureMessage(failure, fallback)
	return failure
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true
	return error instanceof Error && error.name === 'AbortError'
}

function thrownKind(error: unknown, signal?: AbortSignal): RequestFailureKind {
	if (error instanceof AuthExpiredError) return 'auth'
	if (isAbort(error, signal)) return 'aborted'
	return 'network'
}

function buildInit<T>(options: RequestOptions<T>): RequestInit {
	const headers: Record<string, string> = { ...options.headers }
	let body: BodyInit | undefined
	if (options.json !== undefined) {
		const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')
		if (!hasContentType) headers['Content-Type'] = 'application/json'
		body = JSON.stringify(options.json)
	} else if (options.body !== undefined) {
		body = options.body
	}
	const init: RequestInit = {
		method: options.method ?? (body === undefined ? 'GET' : 'POST'),
		headers,
		cache: options.cache ?? 'no-store',
	}
	if (body !== undefined) init.body = body
	if (options.signal) init.signal = options.signal
	if (options.keepalive !== undefined) init.keepalive = options.keepalive
	return init
}

function parseJsonText(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

function filenameFrom(header: string | null, fallback: string): string {
	if (!header) return fallback
	const encoded = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
	if (encoded?.[2]) {
		try {
			const decoded = decodeURIComponent(encoded[2].trim().replace(/^"|"$/g, ''))
			if (decoded) return decoded
		} catch {
			return fallback
		}
	}
	const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
	const name = (plain?.[2] ?? plain?.[1] ?? '').trim()
	return name || fallback
}

export function createRequester(fetchImpl: FetchImpl) {
	async function send<T>(url: string, options: RequestOptions<T>): Promise<Response | RequestFailure> {
		try {
			return await fetchImpl(url, buildInit(options))
		} catch (error) {
			return fail({ kind: thrownKind(error, options.signal) }, options.fallbackMessage)
		}
	}

	async function readText<T>(response: Response, options: RequestOptions<T>): Promise<string | RequestFailure> {
		try {
			return await response.text()
		} catch (error) {
			return fail({ kind: thrownKind(error, options.signal), status: response.status }, options.fallbackMessage)
		}
	}

	function httpFailure(response: Response, text: string, fallback?: string): RequestFailure {
		const body = text ? parseJsonText(text) : undefined
		const draft: FailureDraft = { kind: 'http', status: response.status }
		if (body !== undefined) draft.body = body
		return fail(draft, fallback)
	}

	async function request<T = unknown>(url: string, options: RequestOptions<T> = {}): Promise<RequestOutcome<T>> {
		const response = await send(url, options)
		if (!(response instanceof Response)) return response
		const text = await readText(response, options)
		if (typeof text !== 'string') return text
		if (!response.ok) return httpFailure(response, text, options.fallbackMessage)

		let body: unknown
		if (text) {
			try {
				body = JSON.parse(text)
			} catch {
				return fail({ kind: 'malformed', status: response.status }, options.fallbackMessage)
			}
		}
		if (!options.parse) return { ok: true, status: response.status, data: body as T }
		try {
			return { ok: true, status: response.status, data: options.parse(body) }
		} catch {
			return fail({ kind: 'malformed', status: response.status }, options.fallbackMessage)
		}
	}

	async function requestJson<T = unknown>(url: string, options: RequestOptions<T> = {}): Promise<T> {
		const outcome = await request(url, options)
		if (!outcome.ok) throw new RequestError(outcome)
		return outcome.data
	}

	async function requestBlob(
		url: string,
		options: BlobRequestOptions
	): Promise<RequestOutcome<{ blob: Blob; filename: string }>> {
		const response = await send(url, options)
		if (!(response instanceof Response)) return response
		if (!response.ok) {
			const text = await readText(response, options)
			if (typeof text !== 'string') return text
			return httpFailure(response, text, options.fallbackMessage)
		}
		let blob: Blob
		try {
			blob = await response.blob()
		} catch (error) {
			return fail({ kind: thrownKind(error, options.signal), status: response.status }, options.fallbackMessage)
		}
		const filename = filenameFrom(response.headers.get('content-disposition'), options.filename)
		return { ok: true, status: response.status, data: { blob, filename } }
	}

	return { request, requestJson, requestBlob }
}

export const { request, requestJson, requestBlob } = createRequester(apiFetch)
