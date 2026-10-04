import bcrypt from 'bcryptjs'
import { vi } from 'vitest'

import { startTestServer } from './http.js'
import { createScratchDatabase, migrateTestDatabase, requireTestDatabaseUrl } from './test-database.js'

type DbModule = typeof import('../db/index.js')
type SchemaModule = typeof import('../db/schema.js')

export type AuthApp = {
	baseUrl: string
	db: DbModule['db']
	schema: SchemaModule
	pgPool: DbModule['pgPool']
	stop: () => Promise<void>
}

export type ParsedCookie = {
	value: string
	attributes: Map<string, string>
}

export type CookieJar = Map<string, string>

export type Reply = {
	status: number
	body: Record<string, unknown>
	setCookies: Map<string, ParsedCookie>
	headers: Headers
}

const ENV_KEYS = ['TEST_DATABASE_URL'] as const

let ipCounter = 0

export function nextIp(): string {
	ipCounter += 1
	const third = Math.floor(ipCounter / 250) % 512
	return `198.${18 + Math.floor(third / 256)}.${third % 256}.${(ipCounter % 250) + 1}`
}

export async function startAuthApp(prefix: string): Promise<AuthApp> {
	requireTestDatabaseUrl()
	const scratch = await createScratchDatabase(prefix)
	const previous = new Map<string, string | undefined>(ENV_KEYS.map((key) => [key, process.env[key]]))
	try {
		await migrateTestDatabase(scratch.url)
		process.env.TEST_DATABASE_URL = scratch.url
		vi.resetModules()
		const app = (await import('../app.js')).default
		const dbModule: DbModule = await import('../db/index.js')
		const schema: SchemaModule = await import('../db/schema.js')
		const server = await startTestServer(app)
		let stopped: Promise<void> | null = null
		const stop = () => {
			stopped ??= (async () => {
				try {
					await server.close()
					await dbModule.pgPool.end()
					await scratch.drop()
				} finally {
					restoreEnv(previous)
				}
			})()
			return stopped
		}
		return { baseUrl: server.baseUrl, db: dbModule.db, schema, pgPool: dbModule.pgPool, stop }
	} catch (error) {
		await scratch.drop()
		restoreEnv(previous)
		throw error
	}
}

function restoreEnv(previous: Map<string, string | undefined>): void {
	for (const [key, value] of previous) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

export async function seedUser(
	ctx: AuthApp,
	options: { login: string; roles: string[]; password: string; isActive?: boolean }
): Promise<string> {
	const { db, schema } = ctx
	const passwordHash = await bcrypt.hash(options.password, 4)
	const [created] = await db
		.insert(schema.users)
		.values({ login: options.login, passwordHash, isActive: options.isActive ?? true })
		.returning({ id: schema.users.id })
	if (!created) throw new Error(`seedUser: user ${options.login} was not created`)
	if (options.roles.length > 0) {
		await db
			.insert(schema.roles)
			.values(options.roles.map((key) => ({ key })))
			.onConflictDoNothing()
		await db.insert(schema.userRoles).values(options.roles.map((roleKey) => ({ userId: created.id, roleKey })))
	}
	return created.id
}

export function parseSetCookies(lines: string[]): Map<string, ParsedCookie> {
	const parsed = new Map<string, ParsedCookie>()
	for (const line of lines) {
		const [pair = '', ...rest] = line.split(';')
		const eq = pair.indexOf('=')
		if (eq <= 0) continue
		const name = pair.slice(0, eq).trim()
		if (parsed.has(name)) continue
		const attributes = new Map<string, string>()
		for (const raw of rest) {
			const part = raw.trim()
			if (!part) continue
			const sep = part.indexOf('=')
			if (sep === -1) attributes.set(part.toLowerCase(), '')
			else attributes.set(part.slice(0, sep).trim().toLowerCase(), part.slice(sep + 1).trim())
		}
		parsed.set(name, { value: pair.slice(eq + 1).trim(), attributes })
	}
	return parsed
}

export function cookieHeader(jar: CookieJar): string {
	return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
}

export function mergeCookies(jar: CookieJar, setCookies: Map<string, ParsedCookie>): CookieJar {
	const next = new Map(jar)
	for (const [name, cookie] of setCookies) {
		if (cookie.attributes.get('max-age') === '0' || cookie.value === '') next.delete(name)
		else next.set(name, cookie.value)
	}
	return next
}

export async function call(
	ctx: AuthApp,
	method: string,
	path: string,
	options: { cookies?: CookieJar | string; ip?: string; body?: unknown } = {}
): Promise<Reply> {
	const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? nextIp() }
	const cookie =
		typeof options.cookies === 'string' ? options.cookies : options.cookies && cookieHeader(options.cookies)
	if (cookie) headers.cookie = cookie
	if (options.body !== undefined) headers['content-type'] = 'application/json'
	const response = await fetch(`${ctx.baseUrl}${path}`, {
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	})
	const text = await response.text()
	let body: Record<string, unknown>
	try {
		body = JSON.parse(text) as Record<string, unknown>
	} catch {
		body = { raw: text }
	}
	return {
		status: response.status,
		body,
		setCookies: parseSetCookies(response.headers.getSetCookie()),
		headers: response.headers,
	}
}

export async function login(
	ctx: AuthApp,
	username: string,
	password: string,
	options: { ip?: string } = {}
): Promise<Reply & { jar: CookieJar }> {
	const reply = await call(ctx, 'POST', '/api/auth/login', { ip: options.ip, body: { username, password } })
	return { ...reply, jar: mergeCookies(new Map(), reply.setCookies) }
}
