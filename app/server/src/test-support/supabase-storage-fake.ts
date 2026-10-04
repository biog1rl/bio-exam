export const FAKE_SUPABASE_URL = 'https://fake-project.supabase.test'
export const FAKE_SUPABASE_KEY = 'fake-service-key'

const STORAGE_BASE = `${FAKE_SUPABASE_URL}/storage/v1`
const DEFAULT_LIST_LIMIT = 100

export type FakeStoredObject = { data: Buffer; contentType: string; createdAt: string }

export type FakeStorageOp = 'download' | 'upload' | 'copy' | 'remove' | 'list' | 'exists'

export type FakeCall = { method: string; path: string }

export type SupabaseStorageFake = {
	fetch: (input: unknown, init?: RequestInit) => Promise<Response>
	objects: Map<string, FakeStoredObject>
	failures: Record<FakeStorageOp, Set<string>>
	calls: FakeCall[]
	put: (key: string, data: Buffer | string, contentType?: string) => void
}

type ListBody = {
	prefix?: string
	limit?: number
	offset?: number
	sortBy?: { column?: string; order?: string }
}

type ListEntry =
	| {
			name: string
			id: string
			created_at: string
			updated_at: string
			metadata: { size: number; mimetype: string }
	  }
	| { name: string; id: null; metadata: null }

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function unavailable(): Response {
	return json(503, { message: 'Service Unavailable' })
}

function notFound(): Response {
	return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
}

function duplicate(): Response {
	return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
}

function inputUrl(input: unknown): string {
	if (typeof input === 'string') return input
	if (input instanceof URL) return input.toString()
	if (input && typeof input === 'object' && 'url' in input) return String((input as { url: unknown }).url)
	return String(input)
}

async function bodyBuffer(body: unknown): Promise<Buffer> {
	if (body === undefined || body === null) return Buffer.alloc(0)
	if (typeof body === 'string') return Buffer.from(body)
	if (Buffer.isBuffer(body)) return Buffer.from(body)
	if (body instanceof Uint8Array) return Buffer.from(body)
	if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body))
	if (typeof Blob !== 'undefined' && body instanceof Blob) return Buffer.from(await body.arrayBuffer())
	return Buffer.from(await new Response(body as ConstructorParameters<typeof Response>[0]).arrayBuffer())
}

async function bodyJson<T>(body: unknown): Promise<T> {
	return JSON.parse((await bodyBuffer(body)).toString('utf8')) as T
}

function hasPrefix(key: string, prefix: string): boolean {
	return prefix === '' || key === prefix || key.startsWith(`${prefix}/`)
}

export function createSupabaseStorageFake(): SupabaseStorageFake {
	const objects = new Map<string, FakeStoredObject>()
	const failures: Record<FakeStorageOp, Set<string>> = {
		download: new Set(),
		upload: new Set(),
		copy: new Set(),
		remove: new Set(),
		list: new Set(),
		exists: new Set(),
	}
	const calls: FakeCall[] = []
	let clock = Date.parse('2026-01-01T00:00:00.000Z')

	function nextTimestamp(): string {
		clock += 1000
		return new Date(clock).toISOString()
	}

	function put(key: string, data: Buffer | string, contentType = 'application/octet-stream'): void {
		objects.set(key, { data: Buffer.from(data), contentType, createdAt: nextTimestamp() })
	}

	function listEntries(body: ListBody): ListEntry[] {
		const prefix = (body.prefix ?? '').replace(/\/+$/, '')
		const files = new Map<string, ListEntry>()
		const folders = new Map<string, ListEntry>()
		for (const [key, object] of objects) {
			if (prefix !== '' && !key.startsWith(`${prefix}/`)) continue
			const rest = prefix === '' ? key : key.slice(prefix.length + 1)
			const slash = rest.indexOf('/')
			if (slash === -1) {
				files.set(rest, {
					name: rest,
					id: `id-${key}`,
					created_at: object.createdAt,
					updated_at: object.createdAt,
					metadata: { size: object.data.length, mimetype: object.contentType },
				})
			} else {
				const name = rest.slice(0, slash)
				folders.set(name, { name, id: null, metadata: null })
			}
		}
		const column = body.sortBy?.column === 'created_at' ? 'created_at' : 'name'
		const direction = body.sortBy?.order === 'desc' ? -1 : 1
		const sortValue = (entry: ListEntry): string =>
			column === 'created_at' && entry.id !== null ? entry.created_at : entry.name
		const entries = [...folders.values(), ...files.values()].sort((a, b) => {
			const left = sortValue(a)
			const right = sortValue(b)
			return left < right ? -direction : left > right ? direction : 0
		})
		const offset = body.offset ?? 0
		const limit = body.limit ?? DEFAULT_LIST_LIMIT
		return entries.slice(offset, offset + limit)
	}

	async function handle(method: string, path: string, init: RequestInit | undefined): Promise<Response> {
		const headers = new Headers(init?.headers)

		if (method === 'POST' && path.startsWith('/object/list/')) {
			const body = await bodyJson<ListBody>(init?.body)
			const prefix = (body.prefix ?? '').replace(/\/+$/, '')
			for (const failing of failures.list)
				if (hasPrefix(failing, prefix) || hasPrefix(prefix, failing)) return unavailable()
			return json(200, listEntries(body))
		}

		if (method === 'POST' && path === '/object/copy') {
			const body = await bodyJson<{ bucketId: string; sourceKey: string; destinationKey: string }>(init?.body)
			if (failures.copy.has(body.sourceKey) || failures.copy.has(body.destinationKey)) return unavailable()
			const source = objects.get(body.sourceKey)
			if (!source) return notFound()
			if (objects.has(body.destinationKey)) return duplicate()
			objects.set(body.destinationKey, {
				data: Buffer.from(source.data),
				contentType: source.contentType,
				createdAt: nextTimestamp(),
			})
			return json(200, { Key: `${body.bucketId}/${body.destinationKey}` })
		}

		const objectMatch = /^\/object\/([^/]+)(?:\/(.+))?$/.exec(path)
		if (!objectMatch) return json(404, { statusCode: '404', error: 'not_found', message: 'Route not found' })
		const bucket = objectMatch[1] ?? ''
		const key = objectMatch[2]

		if (method === 'DELETE' && key === undefined) {
			const body = await bodyJson<{ prefixes: string[] }>(init?.body)
			if (body.prefixes.some((prefix) => failures.remove.has(prefix))) return unavailable()
			const removed: Array<{ name: string; bucket_id: string }> = []
			for (const prefix of body.prefixes) {
				if (objects.delete(prefix)) removed.push({ name: prefix, bucket_id: bucket })
			}
			return json(200, removed)
		}

		if (key === undefined) return json(404, { statusCode: '404', error: 'not_found', message: 'Route not found' })

		if (method === 'POST' || method === 'PUT') {
			if (failures.upload.has(key)) return unavailable()
			const upsert = method === 'PUT' || headers.get('x-upsert') === 'true'
			if (!upsert && objects.has(key)) return duplicate()
			const contentType = headers.get('content-type') ?? 'application/octet-stream'
			objects.set(key, { data: await bodyBuffer(init?.body), contentType, createdAt: nextTimestamp() })
			return json(200, { Id: `id-${key}`, Key: `${bucket}/${key}` })
		}

		if (method === 'GET') {
			if (failures.download.has(key)) return unavailable()
			const object = objects.get(key)
			if (!object) return notFound()
			return new Response(new Uint8Array(object.data), {
				status: 200,
				headers: { 'content-type': object.contentType, 'content-length': String(object.data.length) },
			})
		}

		if (method === 'HEAD') {
			if (failures.exists.has(key)) return new Response(null, { status: 503 })
			return new Response(null, { status: objects.has(key) ? 200 : 400 })
		}

		return json(405, { statusCode: '405', error: 'method_not_allowed', message: 'Method not allowed' })
	}

	async function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
		const url = inputUrl(input)
		const method = (init?.method ?? 'GET').toUpperCase()
		if (!url.startsWith(`${STORAGE_BASE}/`)) {
			calls.push({ method, path: url })
			return json(404, { message: 'Unknown host' })
		}
		const path = url.slice(STORAGE_BASE.length).split('?')[0] ?? ''
		calls.push({ method, path })
		return handle(method, path, init)
	}

	return { fetch: fakeFetch, objects, failures, calls, put }
}

export type FakeClientOptions = {
	global: { fetch: SupabaseStorageFake['fetch'] }
	auth: { persistSession: boolean }
}

export function fakeSupabaseClient<T>(
	fake: SupabaseStorageFake,
	createClientImpl: (url: string, key: string, options: FakeClientOptions) => T
): T {
	return createClientImpl(FAKE_SUPABASE_URL, FAKE_SUPABASE_KEY, {
		global: { fetch: fake.fetch },
		auth: { persistSession: false },
	})
}
