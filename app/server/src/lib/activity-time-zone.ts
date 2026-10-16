import { sql, type SQL } from 'drizzle-orm'

import { db } from '../db/index.js'

const TIME_ZONE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/

const knownByDatabase = new Map<string, boolean>()

export function requestedTimeZone(value: unknown): string {
	if (typeof value !== 'string' || !TIME_ZONE.test(value)) return 'UTC'
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value })
		return value
	} catch {
		return 'UTC'
	}
}

export function utcOffsetOf(timeZone: string, at: Date = new Date()): string {
	const label =
		new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
			.formatToParts(at)
			.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
	const match = /^GMT([+-]\d{2}):(\d{2})$/.exec(label)
	return match ? `${match[1]}:${match[2]}` : '+00:00'
}

async function databaseKnows(timeZone: string): Promise<boolean> {
	const cached = knownByDatabase.get(timeZone)
	if (cached !== undefined) return cached
	const result = await db.execute<{ known: boolean }>(
		sql`select exists (select 1 from pg_timezone_names where name = ${timeZone}) as known`
	)
	const known = result.rows[0]?.known === true
	knownByDatabase.set(timeZone, known)
	return known
}

export async function activityTimeZoneSql(value: unknown): Promise<SQL> {
	const timeZone = requestedTimeZone(value)
	if (await databaseKnows(timeZone)) return sql`${timeZone}`
	return sql`(${utcOffsetOf(timeZone)})::interval`
}
