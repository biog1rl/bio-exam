import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'

import { AUTH_CONFIG } from '../../config/auth.js'
import { db } from '../../db/index.js'
import { authSessions, refreshTokens, users } from '../../db/schema.js'
import { hashRefreshToken, newRefreshToken, signAccessToken, verifyAccessToken } from './tokens.js'

export {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	appendSetCookie,
	clearSessionCookies,
	readCookie,
	serializeSessionCookie,
	setSessionCookies,
} from './cookies.js'
export { hashRefreshToken, newRefreshToken, signAccessToken, verifyAccessToken, type AccessClaims } from './tokens.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type IssuedSession = {
	userId: string
	sessionId: string
	accessToken: string
	accessExpiresAt: Date
	refreshToken: string
}

export type ReusedSession = {
	userId: string
	sessionId: string
	accessToken: string
	accessExpiresAt: Date
}

export type RotationResult =
	| { outcome: 'rejected' }
	| ({ outcome: 'rotated' } & IssuedSession)
	| ({ outcome: 'reused' } & ReusedSession)
	| { outcome: 'replay'; userId: string; sessionId: string }

export const REFRESH_REUSE_WINDOW_MS = 30_000

export type SessionUserRecord = { id: string; login: string | null }

export class SessionStoreError extends Error {
	readonly code: string | undefined

	constructor(message: string, code: string | undefined) {
		super(message)
		this.name = 'SessionStoreError'
		this.code = code
	}
}

class RotationRejected extends Error {}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function storeError(error: unknown): SessionStoreError {
	if (error instanceof SessionStoreError) return error
	const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
	const message = cause instanceof Error ? cause.message : 'unknown error'
	const code = (cause as { code?: unknown } | null)?.code
	return new SessionStoreError(`session store: ${message}`, typeof code === 'string' ? code : undefined)
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn()
	} catch (error) {
		throw storeError(error)
	}
}

function refreshExpiresAt(): Date {
	return new Date(Date.now() + AUTH_CONFIG.refreshTokenTtlDays * MS_PER_DAY)
}

function issue(
	input: { userId: string; sessionId: string; login: string | null },
	refreshToken: string
): IssuedSession {
	const access = signAccessToken(input)
	return {
		userId: input.userId,
		sessionId: input.sessionId,
		accessToken: access.token,
		accessExpiresAt: access.expiresAt,
		refreshToken,
	}
}

export function openSession(input: {
	userId: string
	login: string | null
	ip: string | null
}): Promise<IssuedSession> {
	return guarded(async () => {
		const refresh = newRefreshToken()
		const sessionId = await db.transaction(async (tx) => {
			const [session] = await tx
				.insert(authSessions)
				.values({ userId: input.userId })
				.returning({ id: authSessions.id })
			if (!session) throw new Error('auth session was not created')
			await tx.insert(refreshTokens).values({
				userId: input.userId,
				tokenHash: refresh.hash,
				expiresAt: refreshExpiresAt(),
				createdByIp: input.ip,
				sessionId: session.id,
			})
			return session.id
		})
		return issue({ userId: input.userId, sessionId, login: input.login }, refresh.raw)
	})
}

type SessionOwner = { userId: string; sessionId: string; login: string | null }

type CaptureOutcome =
	| { kind: 'rotated'; owner: SessionOwner }
	| { kind: 'reused'; owner: SessionOwner }
	| { kind: 'replay'; userId: string; sessionId: string }
	| { kind: 'rejected' }

const reuseWindow = sql`now() - (${sql.raw(String(REFRESH_REUSE_WINDOW_MS))} * interval '1 millisecond')`

async function classifyRepeat(tx: Tx, tokenHash: string): Promise<CaptureOutcome> {
	const [token] = await tx
		.select({
			userId: refreshTokens.userId,
			sessionId: refreshTokens.sessionId,
			used: sql<boolean>`${refreshTokens.usedAt} IS NOT NULL`,
			withinWindow: sql<boolean>`coalesce(${refreshTokens.usedAt} > ${reuseWindow}, false)`,
			successorUsed: sql<boolean>`EXISTS (SELECT 1 FROM refresh_tokens successor WHERE successor.session_id = refresh_tokens.session_id AND successor.created_at > refresh_tokens.created_at AND successor.used_at IS NOT NULL)`,
		})
		.from(refreshTokens)
		.where(
			and(
				eq(refreshTokens.tokenHash, tokenHash),
				isNull(refreshTokens.revokedAt),
				gt(refreshTokens.expiresAt, sql`now()`)
			)
		)
		.limit(1)
	if (!token || !token.sessionId || !token.used) return { kind: 'rejected' }

	const [live] = await tx
		.select({ login: users.login, active: users.isActive })
		.from(authSessions)
		.innerJoin(users, eq(users.id, authSessions.userId))
		.where(
			and(eq(authSessions.id, token.sessionId), eq(authSessions.userId, token.userId), isNull(authSessions.revokedAt))
		)
		.limit(1)
	if (!live || !live.active) return { kind: 'rejected' }

	if (token.withinWindow && !token.successorUsed) {
		return { kind: 'reused', owner: { userId: token.userId, sessionId: token.sessionId, login: live.login } }
	}
	await revokeSession(token.sessionId, 'replay', tx)
	return { kind: 'replay', userId: token.userId, sessionId: token.sessionId }
}

export function rotateRefreshToken(input: { raw: string; ip: string | null }): Promise<RotationResult> {
	return guarded(async () => {
		const successor = newRefreshToken()
		const tokenHash = hashRefreshToken(input.raw)
		let result: CaptureOutcome
		try {
			result = await db.transaction(async (tx): Promise<CaptureOutcome> => {
				const [captured] = await tx
					.update(refreshTokens)
					.set({ usedAt: sql`now()` })
					.where(
						and(
							eq(refreshTokens.tokenHash, tokenHash),
							isNull(refreshTokens.usedAt),
							isNull(refreshTokens.revokedAt),
							gt(refreshTokens.expiresAt, sql`now()`)
						)
					)
					.returning({
						id: refreshTokens.id,
						userId: refreshTokens.userId,
						sessionId: refreshTokens.sessionId,
					})
				if (!captured) return classifyRepeat(tx, tokenHash)

				let sessionId = captured.sessionId
				if (!sessionId) {
					await tx.insert(authSessions).values({ id: captured.id, userId: captured.userId }).onConflictDoNothing()
					await tx.update(refreshTokens).set({ sessionId: captured.id }).where(eq(refreshTokens.id, captured.id))
					sessionId = captured.id
				}

				const [user] = await tx
					.select({ login: users.login })
					.from(authSessions)
					.innerJoin(users, eq(users.id, authSessions.userId))
					.where(
						and(
							eq(authSessions.id, sessionId),
							eq(authSessions.userId, captured.userId),
							isNull(authSessions.revokedAt),
							eq(users.isActive, true)
						)
					)
					.limit(1)
				if (!user) throw new RotationRejected()

				await tx.insert(refreshTokens).values({
					userId: captured.userId,
					tokenHash: successor.hash,
					expiresAt: refreshExpiresAt(),
					createdByIp: input.ip,
					sessionId,
				})
				await tx
					.update(authSessions)
					.set({ lastRefreshedAt: sql`now()` })
					.where(eq(authSessions.id, sessionId))
				return { kind: 'rotated', owner: { userId: captured.userId, sessionId, login: user.login } }
			})
		} catch (error) {
			if (error instanceof RotationRejected) return { outcome: 'rejected' }
			throw error
		}
		switch (result.kind) {
			case 'rotated':
				return { outcome: 'rotated', ...issue(result.owner, successor.raw) }
			case 'reused': {
				const access = signAccessToken(result.owner)
				return {
					outcome: 'reused',
					userId: result.owner.userId,
					sessionId: result.owner.sessionId,
					accessToken: access.token,
					accessExpiresAt: access.expiresAt,
				}
			}
			case 'replay':
				return { outcome: 'replay', userId: result.userId, sessionId: result.sessionId }
			case 'rejected':
				return { outcome: 'rejected' }
		}
	})
}

export function revokeSession(sessionId: string, reason: string, tx?: Tx): Promise<boolean> {
	const run = async (executor: Tx): Promise<boolean> => {
		const revoked = await executor
			.update(authSessions)
			.set({ revokedAt: sql`now()`, revokeReason: reason })
			.where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)))
			.returning({ id: authSessions.id })
		await executor
			.update(refreshTokens)
			.set({ revokedAt: sql`now()` })
			.where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)))
		return revoked.length > 0
	}
	return guarded(() => (tx ? run(tx) : db.transaction(run)))
}

export function revokeUserSessions(
	userId: string,
	options: { exceptSessionId?: string; reason: string },
	tx?: Tx
): Promise<number> {
	const run = async (executor: Tx): Promise<number> => {
		const conditions = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)]
		if (options.exceptSessionId) conditions.push(ne(authSessions.id, options.exceptSessionId))
		const revoked = await executor
			.update(authSessions)
			.set({ revokedAt: sql`now()`, revokeReason: options.reason })
			.where(and(...conditions))
			.returning({ id: authSessions.id })
		const sessionIds = revoked.map((row) => row.id)
		if (sessionIds.length > 0) {
			await executor
				.update(refreshTokens)
				.set({ revokedAt: sql`now()` })
				.where(and(inArray(refreshTokens.sessionId, sessionIds), isNull(refreshTokens.revokedAt)))
		}
		return sessionIds.length
	}
	return guarded(() => (tx ? run(tx) : db.transaction(run)))
}

export function endSession(input: { accessToken: string | null; refreshToken: string | null }): Promise<number> {
	return guarded(() =>
		db.transaction(async (tx) => {
			const sessionIds = new Set<string>()
			const claims = input.accessToken ? verifyAccessToken(input.accessToken, { allowExpired: true }) : null
			if (claims) sessionIds.add(claims.sessionId)
			if (input.refreshToken) {
				const tokenHash = hashRefreshToken(input.refreshToken)
				const [token] = await tx
					.select({ sessionId: refreshTokens.sessionId })
					.from(refreshTokens)
					.where(eq(refreshTokens.tokenHash, tokenHash))
					.limit(1)
				if (token?.sessionId) sessionIds.add(token.sessionId)
				await tx
					.update(refreshTokens)
					.set({ revokedAt: sql`now()` })
					.where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
			}
			let revoked = 0
			for (const sessionId of sessionIds) {
				if (await revokeSession(sessionId, 'logout', tx)) revoked += 1
			}
			return revoked
		})
	)
}

export function loadSessionUser(sessionId: string, userId: string): Promise<SessionUserRecord | null> {
	return guarded(async () => {
		const [row] = await db
			.select({ id: users.id, login: users.login })
			.from(authSessions)
			.innerJoin(users, eq(users.id, authSessions.userId))
			.where(
				and(
					eq(authSessions.id, sessionId),
					eq(authSessions.userId, userId),
					isNull(authSessions.revokedAt),
					eq(users.isActive, true)
				)
			)
			.limit(1)
		return row ?? null
	})
}
