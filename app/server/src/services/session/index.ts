import { and, eq, gt, isNull, sql } from 'drizzle-orm'

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

export type RotationResult = { outcome: 'rejected' } | ({ outcome: 'rotated' } & IssuedSession)

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

export function rotateRefreshToken(input: { raw: string; ip: string | null }): Promise<RotationResult> {
	return guarded(async () => {
		const successor = newRefreshToken()
		let owner: { userId: string; sessionId: string; login: string | null } | null
		try {
			owner = await db.transaction(async (tx) => {
				const [captured] = await tx
					.update(refreshTokens)
					.set({ usedAt: sql`now()` })
					.where(
						and(
							eq(refreshTokens.tokenHash, hashRefreshToken(input.raw)),
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
				if (!captured) return null

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
				return { userId: captured.userId, sessionId, login: user.login }
			})
		} catch (error) {
			if (error instanceof RotationRejected) return { outcome: 'rejected' }
			throw error
		}
		if (!owner) return { outcome: 'rejected' }
		return { outcome: 'rotated', ...issue(owner, successor.raw) }
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
