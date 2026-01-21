import { sql } from 'drizzle-orm'
import { Router } from 'express'

import { safeDsn } from '../../config/env.js'
import { db, pgPool } from '../../db/index.js'

const router = Router()

router.get('/db', async (_req, res) => {
	const raw = process.env.DATABASE_URL
	let safeConn = 'unknown'
	let user = 'unknown'
	let host = 'unknown'
	let dbname = 'unknown'
	try {
		if (raw) {
			const u = new URL(raw)
			// не показываем пароль
			if (u.password) u.password = '***'
			safeConn = u.toString()
			user = u.username || 'unknown'
			host = `${u.hostname}:${u.port || '5432'}`
			dbname = u.pathname.replace(/^\//, '') || 'unknown'
		}
	} catch {
		safeConn = safeDsn(raw)
	}

	try {
		const ping = await db.execute<{ ok: number }>(sql`select 1 as ok`)
		if (ping.rows[0]?.ok !== 1) {
			return res
				.status(500)
				.json({ ok: false, where: 'drizzle', error: 'Ping failed', conn: safeConn, user, host, dbname })
		}
		const v = await db.execute<{ version: string }>(sql`select version()`)
		return res.json({
			ok: true,
			driver: 'drizzle',
			version: v.rows[0]?.version ?? 'unknown',
			conn: safeConn,
			user,
			host,
			dbname,
		})
	} catch (err: any) {
		try {
			const rawV = await pgPool.query<{ version: string }>('select version()')
			return res.json({
				ok: true,
				driver: 'pg',
				version: rawV.rows[0]?.version ?? 'unknown',
				note: 'drizzle failed but raw Pool succeeded',
				conn: safeConn,
				user,
				host,
				dbname,
				drizzleError: toMsg(err),
			})
		} catch (rawErr: any) {
			return res.status(500).json({
				ok: false,
				where: 'both',
				conn: safeConn,
				user,
				host,
				dbname,
				drizzleError: toMsg(err),
				rawError: toMsg(rawErr),
			})
		}
	}
})

function toMsg(e: unknown) {
	if (e && typeof e === 'object') {
		const any = e as any
		return [any.message, any.code && `code=${any.code}`, any.severity && `severity=${any.severity}`]
			.filter(Boolean)
			.join(' | ')
	}
	return String(e)
}

export default router
