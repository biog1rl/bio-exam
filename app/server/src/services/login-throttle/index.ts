import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import {
	FAILURE_RESET_MS,
	IP_TRUSTED,
	blockMs,
	bucketKeys,
	freeFailures,
	ipKey,
	loginKey,
	pairKey,
	type BucketKind,
} from './progression.js'

export { clientIp } from './client-ip.js'
export {
	FAILURE_RESET_MS,
	IP_TRUSTED,
	LOGIN_CAP_MS,
	PAIR_CAP_MS,
	bucketKeys,
	ipBlockMs,
	ipKey,
	loginBlockMs,
	loginKey,
	pairBlockMs,
	pairKey,
} from './progression.js'

export type ReserveResult = { blocked: true; retryAfterSec: number } | { blocked: false }

type LockedRow = {
	bucket_key: string
	failures: number
	stale: boolean
	retry_after_sec: number | string | null
}

class Blocked extends Error {
	readonly retryAfterSec: number

	constructor(retryAfterSec: number) {
		super('login attempt throttled')
		this.name = 'Blocked'
		this.retryAfterSec = retryAfterSec
	}
}

const staleBefore = sql`now() - (${sql.raw(String(FAILURE_RESET_MS))} * interval '1 millisecond')`

export async function reserveAttempt(
	input: { login: string; ip: string },
	ipTrusted: boolean = IP_TRUSTED
): Promise<ReserveResult> {
	const buckets = bucketKeys(input.login, input.ip, ipTrusted)
	const kinds = new Map<string, BucketKind>(buckets.map((bucket) => [bucket.key, bucket.kind]))
	const keys = buckets.map((bucket) => bucket.key)
	try {
		await db.transaction(async (tx) => {
			const values = sql.join(
				buckets.map((bucket) => sql`(${bucket.key}, ${bucket.login})`),
				sql`, `
			)
			const locked = await tx.execute<LockedRow>(sql`
				INSERT INTO login_throttle (bucket_key, login)
				VALUES ${values}
				ON CONFLICT (bucket_key) DO UPDATE SET updated_at = login_throttle.updated_at
				RETURNING
					bucket_key,
					failures,
					updated_at < ${staleBefore} AS stale,
					CASE
						WHEN blocked_until > now() THEN ceil(extract(epoch FROM (blocked_until - now())))
						ELSE NULL
					END AS retry_after_sec
			`)

			await tx.execute(sql`
				DELETE FROM login_throttle
				WHERE bucket_key IN (
					SELECT bucket_key FROM login_throttle
					WHERE updated_at < ${staleBefore}
						AND bucket_key NOT IN (${sql.join(
							keys.map((key) => sql`${key}`),
							sql`, `
						)})
					FOR UPDATE SKIP LOCKED
				)
			`)

			const retryAfter = locked.rows
				.map((row) => (row.retry_after_sec === null ? 0 : Number(row.retry_after_sec)))
				.reduce((max, value) => Math.max(max, value), 0)
			if (retryAfter > 0) throw new Blocked(Math.max(1, Math.ceil(retryAfter)))

			for (const row of locked.rows) {
				const kind = kinds.get(row.bucket_key)
				if (!kind) continue
				const failures = (row.stale ? 0 : Number(row.failures)) + 1
				const windowMs = blockMs(kind, failures, ipTrusted)
				await tx.execute(sql`
					UPDATE login_throttle
					SET failures = ${failures},
						blocked_until = ${windowMs > 0 ? sql`now() + (${windowMs}::integer * interval '1 millisecond')` : sql`NULL`},
						updated_at = now()
					WHERE bucket_key = ${row.bucket_key}
				`)
			}
		})
		return { blocked: false }
	} catch (error) {
		if (error instanceof Blocked) return { blocked: true, retryAfterSec: error.retryAfterSec }
		throw error
	}
}

export async function recordSuccess(
	input: { login: string; ip: string },
	ipTrusted: boolean = IP_TRUSTED
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`DELETE FROM login_throttle WHERE bucket_key = ${pairKey(input.login, input.ip)}`)
		const returned: Array<[string, BucketKind]> = [[loginKey(input.login), 'login']]
		if (ipTrusted) returned.push([ipKey(input.ip), 'ip'])
		for (const [key, kind] of returned) {
			await tx.execute(sql`
				UPDATE login_throttle
				SET failures = greatest(failures - 1, 0),
					blocked_until = CASE
						WHEN greatest(failures - 1, 0) <= ${freeFailures(kind)} THEN NULL
						ELSE blocked_until
					END
				WHERE bucket_key = ${key}
			`)
		}
	})
}

export async function clearForLogin(login: string): Promise<number> {
	const result = await db.execute(sql`DELETE FROM login_throttle WHERE login = ${login}`)
	return result.rowCount ?? 0
}
