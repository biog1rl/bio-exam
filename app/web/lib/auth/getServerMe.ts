import { ROLE_KEYS, PERMISSION_DOMAINS, type RoleKey, type PermissionKey } from '@bio-exam/rbac'

import { cookies, headers } from 'next/headers'
import 'server-only'

type RawMeResponse = {
	ok?: boolean
	user?: {
		id?: unknown
		login?: unknown
		firstName?: unknown
		lastName?: unknown
		avatar?: unknown
		avatarCropped?: unknown
		avatarColor?: unknown
		initials?: unknown
		avatarCropX?: unknown
		avatarCropY?: unknown
		avatarCropZoom?: unknown
		avatarCropRotation?: unknown
		avatarCropViewX?: unknown
		avatarCropViewY?: unknown
		roles?: unknown
		perms?: unknown
	}
}

export type ServerMe = {
	id: string
	login: string | null
	firstName: string | null
	lastName: string | null
	avatar: string | null
	avatarCropped: string | null
	avatarColor: string | null
	initials: string | null
	avatarCropX: number | null
	avatarCropY: number | null
	avatarCropZoom: number | null
	avatarCropRotation: number | null
	avatarCropViewX: number | null
	avatarCropViewY: number | null
	roles: RoleKey[]
	perms: PermissionKey[]
}

function toRoleKeys(list: unknown): RoleKey[] {
	if (!Array.isArray(list)) return []
	const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
	return list.filter((role): role is RoleKey => typeof role === 'string' && allow.has(role))
}

const ALLOWED_PERMISSION_KEYS: ReadonlySet<string> = (() => {
	const all: string[] = []
	for (const [domain, cfg] of Object.entries(PERMISSION_DOMAINS)) {
		for (const action of cfg.actions) {
			all.push(`${domain}.${action}`)
		}
	}
	return new Set(all)
})()

function toPermissionKeys(list: unknown): PermissionKey[] {
	if (!Array.isArray(list)) return []
	return list.filter((key): key is PermissionKey => typeof key === 'string' && ALLOWED_PERMISSION_KEYS.has(key))
}

async function resolveApiOrigin(): Promise<string> {
	if (process.env.API_ORIGIN) return process.env.API_ORIGIN

	const h = await headers()
	const proto = h.get('x-forwarded-proto') || 'http'
	const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
	return `${proto}://${host}`
}

export async function getServerMe(): Promise<ServerMe | null> {
	const cookieStorage = await cookies()
	const cookieHeader = cookieStorage.toString()
	const base = await resolveApiOrigin()
	const url = `${base.replace(/\/$/, '')}/api/auth/me`

	const MAX_RETRIES = 5
	const BASE_DELAY = 500

	let res: Response | null = null
	console.log('[getServerMe] Fetching:', url)

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			res = await fetch(url, {
				method: 'GET',
				headers: cookieHeader ? { cookie: cookieHeader } : undefined,
				cache: 'no-store',
			})
			break // Success, exit loop
		} catch (error: unknown) {
			const err = error as { cause?: { code?: string }; code?: string } | null
			const isConnRefused = err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ECONNREFUSED'

			if (isConnRefused && attempt < MAX_RETRIES) {
				const delay = BASE_DELAY * attempt
				console.warn(`[getServerMe] Connection refused. Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`)
				await new Promise((resolve) => setTimeout(resolve, delay))
				continue
			}

			// API сервер недоступен (ECONNREFUSED и т.д.) или кончились попытки
			console.error(`[getServerMe] Failed to fetch from ${url} (attempt ${attempt}/${MAX_RETRIES}):`, error)
			return null
		}
	}

	if (!res || !res.ok) return null

	let json: RawMeResponse | null = null
	try {
		json = (await res.json()) as RawMeResponse
	} catch (e) {
		console.error('[getServerMe] Failed to parse JSON:', e)
		return null
	}

	if (!json?.ok || !json.user || typeof json.user !== 'object') return null

	const idRaw = json.user.id
	if (typeof idRaw !== 'string' || !idRaw) return null

	const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
	const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null)

	const login = asString(json.user.login)
	const firstName = asString(json.user.firstName)
	const lastName = asString(json.user.lastName)
	const avatar = asString(json.user.avatar)
	const avatarCropped = asString(json.user.avatarCropped)
	const avatarColor = asString(json.user.avatarColor)
	const initials = asString(json.user.initials)

	const avatarCropX = asNumber(json.user.avatarCropX)
	const avatarCropY = asNumber(json.user.avatarCropY)
	const avatarCropZoom = asNumber(json.user.avatarCropZoom)
	const avatarCropRotation = asNumber(json.user.avatarCropRotation)
	const avatarCropViewX = asNumber(json.user.avatarCropViewX)
	const avatarCropViewY = asNumber(json.user.avatarCropViewY)

	const roles = toRoleKeys(json.user.roles)
	const perms = toPermissionKeys(json.user.perms)

	return {
		id: idRaw,
		login,
		firstName,
		lastName,
		avatar,
		avatarCropped,
		avatarColor,
		initials,
		avatarCropX,
		avatarCropY,
		avatarCropZoom,
		avatarCropRotation,
		avatarCropViewX,
		avatarCropViewY,
		roles,
		perms,
	}
}

export async function isAuthenticated(): Promise<boolean> {
	const me = await getServerMe()
	return Boolean(me)
}
