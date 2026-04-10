import {
	buildPermissionSet,
	normaliseRoleKeys,
	PERMISSION_DOMAINS,
	type PermissionDomain,
	type PermissionKey,
	type RoleKey,
} from '@bio-exam/rbac'

import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { Pool, type PoolConfig } from 'pg'
import 'server-only'

import { readSessionCookieValue } from '@/lib/auth/sessionCookie'
import { env } from '@/lib/env/server'

type JwtPayload = { sub: string; roles?: string[] }

type UserRow = {
	id: string
	login: string | null
	first_name: string | null
	last_name: string | null
	avatar: string | null
	avatar_cropped: string | null
	avatar_color: string | null
	initials: string | null
	avatar_crop_x: number | null
	avatar_crop_y: number | null
	avatar_crop_zoom: number | null
	avatar_crop_rotation: number | null
	avatar_crop_view_x: number | null
	avatar_crop_view_y: number | null
	is_active: boolean
}

type RoleGrantRow = {
	domain: string
	action: string
	allow: boolean
}

type UserGrantRow = {
	domain: string
	action: string
	allow: boolean
}

type RoleRow = { role_key: string }

type MeData = {
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

const JWT_SECRET = env.AUTH_JWT_SECRET
const isDev = process.env.NODE_ENV !== 'production'

function shouldEnableSsl(connectionString: string): boolean {
	if (process.env.PG_FORCE_SSL === '1') return true

	try {
		const u = new URL(connectionString)
		const hasSslParam = u.searchParams.has('sslmode') || u.searchParams.has('ssl')
		if (hasSslParam) return false
		return u.hostname.endsWith('.supabase.com')
	} catch {
		return false
	}
}

const globalForPg = globalThis as typeof globalThis & {
	__bioExamWebAuthPool?: Pool
}

const poolConfig: PoolConfig = {
	connectionString: env.DATABASE_URL,
	max: Number(process.env.PG_POOL_MAX ?? (isDev ? 2 : 5)),
	maxUses: Number(process.env.PG_MAX_USES ?? 200),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5_000),
	query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS ?? 10_000),
	statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 10_000),
	keepAlive: true,
	keepAliveInitialDelayMillis: Number(process.env.PG_KEEPALIVE_DELAY_MS ?? 10_000),
}

if (shouldEnableSsl(env.DATABASE_URL)) {
	poolConfig.ssl = { rejectUnauthorized: false }
}

const pool = globalForPg.__bioExamWebAuthPool ?? new Pool(poolConfig)

if (!globalForPg.__bioExamWebAuthPool) {
	globalForPg.__bioExamWebAuthPool = pool
}

function isPermissionKey(domain: string, action: string): domain is PermissionDomain {
	const config = PERMISSION_DOMAINS[domain as PermissionDomain]
	return Boolean(config && config.actions.includes(action as never))
}

function applyGrant(target: Set<PermissionKey>, row: RoleGrantRow | UserGrantRow) {
	if (!isPermissionKey(row.domain, row.action)) return

	const key = `${row.domain}.${row.action}` as PermissionKey
	if (row.allow) target.add(key)
	else target.delete(key)
}

export async function getMeData(): Promise<MeData | null> {
	const cookieStore = await cookies()
	const token = readSessionCookieValue(cookieStore, env.SESSION_COOKIE_NAME)
	if (!token) return null

	let payload: JwtPayload
	try {
		payload = jwt.verify(token, JWT_SECRET) as JwtPayload
	} catch {
		return null
	}

	const userId = payload.sub
	if (!userId) return null

	try {
		const rolePromise = pool.query<RoleRow>('select role_key from user_roles where user_id = $1', [userId])
		const userPromise = pool.query<UserRow>(
			`
				select
					id,
					login,
					first_name,
					last_name,
					avatar,
					avatar_cropped,
					avatar_color,
					initials,
					avatar_crop_x,
					avatar_crop_y,
					avatar_crop_zoom,
					avatar_crop_rotation,
					avatar_crop_view_x,
					avatar_crop_view_y,
					is_active
				from users
				where id = $1
				limit 1
			`,
			[userId]
		)

		const [userResult, rolesResult] = await Promise.all([userPromise, rolePromise])
		const user = userResult.rows[0]
		if (!user || !user.is_active) return null

		const dbRoles = normaliseRoleKeys(rolesResult.rows.map((row) => row.role_key))
		const jwtRoles = payload.roles ? normaliseRoleKeys(payload.roles) : []
		const roles = Array.from(new Set<RoleKey>([...dbRoles, ...jwtRoles]))

		const perms = buildPermissionSet(roles)

		if (roles.length > 0) {
			const roleGrantRows = await pool.query<RoleGrantRow>(
				'select domain, action, allow from rbac_role_grants where role_key = any($1::text[])',
				[roles]
			)
			for (const row of roleGrantRows.rows) {
				applyGrant(perms, row)
			}
		}

		const userGrantRows = await pool.query<UserGrantRow>(
			'select domain, action, allow from rbac_user_grants where user_id = $1',
			[userId]
		)
		for (const row of userGrantRows.rows) {
			applyGrant(perms, row)
		}

		return {
			id: user.id,
			login: user.login,
			firstName: user.first_name,
			lastName: user.last_name,
			avatar: user.avatar,
			avatarCropped: user.avatar_cropped,
			avatarColor: user.avatar_color,
			initials: user.initials,
			avatarCropX: user.avatar_crop_x,
			avatarCropY: user.avatar_crop_y,
			avatarCropZoom: user.avatar_crop_zoom,
			avatarCropRotation: user.avatar_crop_rotation,
			avatarCropViewX: user.avatar_crop_view_x,
			avatarCropViewY: user.avatar_crop_view_y,
			roles,
			perms: Array.from(perms),
		}
	} catch (error) {
		console.error('[auth/getMeData] DB error:', error)
		return null
	}
}
