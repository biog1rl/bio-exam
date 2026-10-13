import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'

export type JobReport = Record<string, number | string>

export type Job = {
	name: string
	intervalMs: number | null
	runOnce(ctx: { signal: AbortSignal }): Promise<JobReport>
}

export type JobRunResult = JobReport | { skipped: 'locked' }

export type JobRunner = {
	register(job: Job): void
	start(): void
	stop(): Promise<void>
	runNow(name: string): Promise<JobRunResult>
	names(): string[]
}

type LogFn = (data: Record<string, unknown>, message: string) => void

export type JobLog = { info: LogFn; error: LogFn; warn: LogFn }

export type JobRunnerOptions = {
	log: JobLog
	setTimer?: (fn: () => void, ms: number) => unknown
	clearTimer?: (handle: unknown) => void
}

export const JOB_LOCK_NAMESPACE = 11011

function defaultSetTimer(fn: () => void, ms: number): unknown {
	const handle = setTimeout(fn, ms)
	handle.unref()
	return handle
}

function defaultClearTimer(handle: unknown): void {
	clearTimeout(handle as ReturnType<typeof setTimeout>)
}

function isEventful(result: JobRunResult): boolean {
	return Object.values(result).some((value) => value !== 0)
}

export function createJobRunner(options: JobRunnerOptions): JobRunner {
	const { log } = options
	const setTimer = options.setTimer ?? defaultSetTimer
	const clearTimer = options.clearTimer ?? defaultClearTimer
	const jobs = new Map<string, Job>()
	const timers = new Map<string, unknown>()
	const running = new Set<Promise<unknown>>()
	const controller = new AbortController()
	let started = false
	let stopped = false

	function track<T>(promise: Promise<T>): Promise<T> {
		running.add(promise)
		void promise.then(
			() => running.delete(promise),
			() => running.delete(promise)
		)
		return promise
	}

	async function runLocked(job: Job): Promise<JobRunResult> {
		const result = await db.transaction(async (lockTx): Promise<JobRunResult> => {
			const locked = await lockTx.execute<{ locked: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(${JOB_LOCK_NAMESPACE}::int, hashtext(${job.name})) AS locked`
			)
			if (locked.rows[0]?.locked !== true) return { skipped: 'locked' }
			return job.runOnce({ signal: controller.signal })
		})
		if (isEventful(result)) log.info({ job: job.name, report: result }, 'background job run')
		return result
	}

	function jobOf(name: string): Job {
		const job = jobs.get(name)
		if (!job) throw new Error(`unknown job ${name}`)
		return job
	}

	function schedule(job: Job): void {
		if (stopped || job.intervalMs === null) return
		timers.set(
			job.name,
			setTimer(() => void tick(job), job.intervalMs)
		)
	}

	async function tick(job: Job): Promise<void> {
		timers.delete(job.name)
		if (stopped) return
		try {
			await track(runLocked(job))
		} catch (error) {
			log.error({ job: job.name, err: error }, 'background job failed')
		} finally {
			schedule(job)
		}
	}

	return {
		register(job) {
			if (jobs.has(job.name)) throw new Error(`job ${job.name} already registered`)
			jobs.set(job.name, job)
			if (started) schedule(job)
		},
		start() {
			if (started || stopped) return
			started = true
			for (const job of jobs.values()) schedule(job)
		},
		async stop() {
			stopped = true
			for (const handle of timers.values()) clearTimer(handle)
			timers.clear()
			controller.abort()
			await Promise.allSettled([...running])
		},
		async runNow(name) {
			const job = jobOf(name)
			return track(runLocked(job))
		},
		names() {
			return [...jobs.keys()]
		},
	}
}
