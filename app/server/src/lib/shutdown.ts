import type { Server } from 'node:http'

type LogFn = (data: Record<string, unknown>, message: string) => void

export const SHUTDOWN_DRAIN_MS = 25_000

const DEFAULT_REAP_INTERVAL_MS = 1000

export type ShutdownDeps = {
	server: Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>
	jobs: { stop(): Promise<void> }
	pool: { end(): Promise<void> }
	drainMs: number
	log: { info: LogFn; warn: LogFn; error: LogFn }
	exit: (code: number) => void
	reapIntervalMs?: number
}

export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
	const { server, jobs, pool, drainMs, log, exit } = deps
	const reapIntervalMs = deps.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS
	let started = false

	return async (signal) => {
		if (started) {
			log.warn({ signal }, 'repeated shutdown signal, exiting immediately')
			exit(1)
			return
		}
		started = true
		log.info({ signal }, 'shutdown started')

		const reaper = setInterval(() => server.closeIdleConnections(), reapIntervalMs)
		const closed = new Promise<void>((resolve) => {
			server.close((error) => {
				clearInterval(reaper)
				if (error) log.error({ err: error }, 'http server close failed')
				resolve()
			})
		})
		const stopped = jobs.stop().catch((error: unknown) => {
			log.error({ err: error }, 'background jobs stop failed')
		})

		let limit: ReturnType<typeof setTimeout> | undefined
		const timedOut = await Promise.race([
			Promise.all([closed, stopped]).then(() => false),
			new Promise<boolean>((resolve) => {
				limit = setTimeout(() => resolve(true), drainMs)
			}),
		])
		clearTimeout(limit)
		clearInterval(reaper)

		if (timedOut) {
			log.warn({ signal, drainMs }, 'shutdown drain limit reached, closing remaining connections')
			server.closeAllConnections()
		}

		await pool.end().catch((error: unknown) => {
			log.error({ err: error }, 'database pool end failed')
		})
		log.info({ signal }, 'shutdown complete')
		exit(0)
	}
}
