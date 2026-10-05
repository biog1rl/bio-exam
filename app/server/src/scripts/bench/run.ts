import type { Request } from 'express'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { isIsolatedEnv } from '../../config/test-database-url.js'
import type { searchDatabase as SearchDatabase } from '../../services/search/database-search.js'
import { createScratchDatabase, migrateTestDatabase, requireTestDatabaseUrl } from '../../test-support/test-database.js'
import {
	instrumentPool,
	instrumentStorage,
	percentile,
	round,
	sampleMemory,
	settleMemory,
	type PoolProbe,
	type StorageProbe,
} from './probes.js'
import type { BenchSeed } from './seed.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const USAGE =
	'usage: node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server tsx src/scripts/bench/run.ts --out <file.json> [--quick] [--only prompts] [--read-delay <ms>] [--runs <n>]'

const PG_POOL_MAX = 20
const SEARCH_QUERIES = ['клетка', 'митохондрия', 'фотосинтез']
const SEARCH_RUNS = 50
const SEARCH_WARMUP = 3
const SEARCH_LIMIT = 10
const QUICK_SEARCH_RUNS = 5
const PROMPT_READ_DELAY_MS = 20
const PROMPT_RUNS = 5
const ZIP_READ_DELAY_MS = 0
const ZIP_RUNS = 5
const WARMUP_RUNS = 1
const MEMORY_SAMPLE_MS = 5

type SearchAccess = Parameters<typeof SearchDatabase>[0]['access']

type Section = 'prompts'

type Args = { out: string | null; quick: boolean; only: Section | null; readDelayMs: number; runs: number }

const SECTIONS: readonly Section[] = ['prompts']

function readValue(argv: string[], index: number, name: string): string {
	const arg = argv[index] ?? ''
	if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
	const value = argv[index + 1]
	if (value === undefined) throw new Error(`${name} needs a value\n${USAGE}`)
	return value
}

function readNumber(value: string, name: string, min: number): number {
	const parsed = Number(value)
	if (value.trim() === '' || !Number.isInteger(parsed) || parsed < min) {
		throw new Error(`${name} needs an integer >= ${min}\n${USAGE}`)
	}
	return parsed
}

function parseArgs(argv: string[]): Args {
	let out: string | null = null
	let quick = false
	let only: Section | null = null
	let readDelayMs = PROMPT_READ_DELAY_MS
	let runs = PROMPT_RUNS
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const name = arg.split('=')[0] ?? ''
		const inline = arg.includes('=')
		if (arg === '--quick') quick = true
		else if (name === '--out') out = readValue(argv, index, name)
		else if (name === '--only') {
			const value = readValue(argv, index, name)
			if (!SECTIONS.includes(value as Section)) throw new Error(`--only accepts ${SECTIONS.join(', ')}\n${USAGE}`)
			only = value as Section
		} else if (name === '--read-delay') readDelayMs = readNumber(readValue(argv, index, name), name, 0)
		else if (name === '--runs') runs = readNumber(readValue(argv, index, name), name, 1)
		else throw new Error(`unknown argument ${arg}\n${USAGE}`)
		if (name !== '--quick' && !inline) index += 1
	}
	if (out === '') throw new Error(`--out needs a file\n${USAGE}`)
	if (quick && only === 'prompts') throw new Error(`--quick skips prompts, drop one of them\n${USAGE}`)
	return { out, quick, only, readDelayMs, runs }
}

function assertIsolated(): void {
	if (!isIsolatedEnv()) {
		throw new Error(`bench runs only with BIO_EXAM_ISOLATED_ENV=1 and TEST_DATABASE_URL\n${USAGE}`)
	}
	requireTestDatabaseUrl()
}

function stats(values: number[]) {
	return {
		p50Ms: round(percentile(values, 50)),
		p95Ms: round(percentile(values, 95)),
		minMs: round(Math.min(...values)),
		maxMs: round(Math.max(...values)),
	}
}

function median(values: number[]): number {
	return percentile(values, 50)
}

function fakeRequest(userId: string): Request {
	return { authUser: { id: userId } } as unknown as Request
}

async function searchAccess(userId: string): Promise<SearchAccess> {
	const policy = await import('../../services/access-policy/index.js')
	const req = fakeRequest(userId)
	const [access, tests, groups, users] = await Promise.all([
		policy.requestAccess(req),
		policy.testScope(req),
		policy.groupScope(req),
		policy.userScope(req),
	])
	return { userId, permissions: access.permissions, tests, groups, users }
}

async function measureSearch(
	poolProbe: PoolProbe,
	accounts: Array<{ name: string; userId: string }>,
	options: { queries: string[]; runs: number }
) {
	const { searchDatabase } = await import('../../services/search/database-search.js')
	const byAccess: Record<string, unknown> = {}
	for (const account of accounts) {
		const access = await searchAccess(account.userId)
		const call = (query: string) => searchDatabase({ query, scope: 'all', limit: SEARCH_LIMIT, access })
		for (let index = 0; index < SEARCH_WARMUP; index += 1) await call(options.queries[0] ?? '')

		const durations: number[] = []
		const queryCounts: number[] = []
		let maxConcurrent = 0
		let availableCategories = 0
		const perQuery: Record<string, unknown> = {}
		for (const query of options.queries) {
			const queryDurations: number[] = []
			let results = 0
			for (let run = 0; run < options.runs; run += 1) {
				poolProbe.reset()
				const started = performance.now()
				const response = await call(query)
				const elapsed = performance.now() - started
				const snapshot = poolProbe.snapshot()
				if (snapshot.queries === 0) throw new Error('search probe counted zero pool queries')
				durations.push(elapsed)
				queryDurations.push(elapsed)
				queryCounts.push(snapshot.queries)
				maxConcurrent = Math.max(maxConcurrent, snapshot.maxConcurrent)
				availableCategories = response.categories.filter((category) => category.available).length
				results = response.total
			}
			perQuery[query] = { results, ...stats(queryDurations) }
		}
		byAccess[account.name] = {
			availableCategories,
			queriesPerCall: { min: Math.min(...queryCounts), max: Math.max(...queryCounts) },
			maxConcurrentQueries: maxConcurrent,
			calls: durations.length,
			...stats(durations),
			perQuery,
		}
	}
	return {
		pgPoolMax: PG_POOL_MAX,
		queries: options.queries,
		runsPerQuery: options.runs,
		warmupCallsExcluded: SEARCH_WARMUP,
		limit: SEARCH_LIMIT,
		byAccess,
	}
}

async function measurePrompts(
	poolProbe: PoolProbe,
	storageProbe: StorageProbe,
	seed: BenchSeed,
	baseUrl: string,
	options: { readDelayMs: number; runs: number }
) {
	const student = seed.students[0]
	if (!student) throw new Error('prompts: no student in seed')
	const { sessionCookieFor } = await import('../../test-support/http.js')
	const { readAdminTest } = await import('../../services/question-content/index.js')
	const cookie = await sessionCookieFor(student)
	const expected = seed.largestTest.questions
	storageProbe.setReadDelay(options.readDelayMs)

	const pass = async () => {
		const response = await fetch(`${baseUrl}/api/tests/public/tests/${seed.largestTest.id}`, { headers: { cookie } })
		const body = (await response.json()) as { questions?: Array<{ promptText?: string }> }
		if (response.status !== 200) throw new Error(`prompts: pass returned ${response.status}`)
		const items = body.questions ?? []
		if (items.length !== expected) throw new Error(`prompts: pass returned ${items.length} of ${expected} questions`)
		if (items.some((item) => !item.promptText)) throw new Error('prompts: pass returned an empty prompt')
	}
	const admin = async () => {
		const result = await readAdminTest({ testId: seed.largestTest.id })
		const items = 'questions' in result ? result.questions : []
		if (items.length !== expected) throw new Error(`prompts: admin read returned ${items.length} of ${expected}`)
	}

	const measure = async (fn: () => Promise<void>) => {
		for (let index = 0; index < WARMUP_RUNS; index += 1) await fn()
		const durations: number[] = []
		const reads: number[] = []
		const queries: number[] = []
		let maxConcurrentReads = 0
		for (let run = 0; run < options.runs; run += 1) {
			storageProbe.reset()
			poolProbe.reset()
			const started = performance.now()
			await fn()
			durations.push(performance.now() - started)
			const reading = storageProbe.snapshot()
			if (reading.reads === 0) throw new Error('prompts probe counted zero storage reads')
			reads.push(reading.reads)
			queries.push(poolProbe.snapshot().queries)
			maxConcurrentReads = Math.max(maxConcurrentReads, reading.maxConcurrent)
		}
		return {
			maxConcurrentReads,
			reads: median(reads),
			queries: median(queries),
			medianMs: round(median(durations)),
			minMs: round(Math.min(...durations)),
			maxMs: round(Math.max(...durations)),
			timesMs: durations.map((value) => round(value)),
		}
	}

	const result = {
		readDelayMs: options.readDelayMs,
		runs: options.runs,
		warmupRunsExcluded: WARMUP_RUNS,
		test: { slug: seed.largestTest.slug, questions: expected },
		pass: await measure(pass),
		admin: await measure(admin),
	}
	storageProbe.setReadDelay(0)
	return result
}

async function measureZip(poolProbe: PoolProbe, storageProbe: StorageProbe, seed: BenchSeed) {
	const { buildTopicArchive } = await import('../../services/question-content/index.js')
	storageProbe.setReadDelay(ZIP_READ_DELAY_MS)
	const build = () =>
		buildTopicArchive({
			topicSlug: seed.largestTopic.slug,
			withAnswers: true,
			scope: { all: true },
			limitBytes: Number.MAX_SAFE_INTEGER,
		})

	for (let index = 0; index < WARMUP_RUNS; index += 1) await build()
	const durations: number[] = []
	const peaks: number[] = []
	const baselines: number[] = []
	let archiveBytes = 0
	let queries = 0
	let reads = 0
	let readBytes = 0
	let maxConcurrentReads = 0
	for (let run = 0; run < ZIP_RUNS; run += 1) {
		await settleMemory()
		storageProbe.reset()
		poolProbe.reset()
		const sampler = sampleMemory(MEMORY_SAMPLE_MS)
		const started = performance.now()
		const archive = await build()
		durations.push(performance.now() - started)
		const memory = sampler.stop()
		peaks.push(memory.peakDeltaBytes)
		baselines.push(memory.baselineBytes)
		const reading = storageProbe.snapshot()
		if (reading.reads === 0) throw new Error('zip probe counted zero storage reads')
		archiveBytes = archive.buffer.length
		queries = poolProbe.snapshot().queries
		reads = reading.reads
		readBytes = reading.readBytes
		maxConcurrentReads = Math.max(maxConcurrentReads, reading.maxConcurrent)
	}
	return {
		topic: seed.largestTopic.slug,
		tests: seed.largestTopic.tests,
		withAnswers: true,
		readDelayMs: ZIP_READ_DELAY_MS,
		runs: ZIP_RUNS,
		warmupRunsExcluded: WARMUP_RUNS,
		queries,
		reads,
		readBytes,
		maxConcurrentReads,
		archiveBytes,
		receiverPeakBytes: archiveBytes,
		arrayBuffersPeakDeltaBytes: { median: median(peaks), max: Math.max(...peaks), runs: peaks },
		arrayBuffersBaselineBytes: baselines,
		medianMs: round(median(durations)),
		minMs: round(Math.min(...durations)),
		maxMs: round(Math.max(...durations)),
		timesMs: durations.map((value) => round(value)),
	}
}

function gitCommit(): string | null {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
	} catch {
		return null
	}
}

function environment(postgres: string | null) {
	const cpus = os.cpus()
	return {
		node: process.version,
		platform: `${os.platform()} ${os.release()} ${os.arch()}`,
		cpu: cpus[0]?.model ?? 'unknown',
		cpuCount: cpus.length,
		totalMemBytes: os.totalmem(),
		postgres,
		pgPoolMax: PG_POOL_MAX,
		storage: 'memory',
		commit: gitCommit(),
	}
}

function seedSummary(seed: BenchSeed) {
	return { ...seed.counts, largestTest: seed.largestTest, largestTopic: seed.largestTopic }
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2))
	assertIsolated()

	const scratch = await createScratchDatabase('test_bench')
	let closePool: (() => Promise<void>) | null = null
	let closeServer: (() => Promise<void>) | null = null
	let report: Record<string, unknown>
	try {
		await migrateTestDatabase(scratch.url)
		process.env.TEST_DATABASE_URL = scratch.url
		process.env.STORAGE_DRIVER = 'memory'
		process.env.PG_POOL_MAX = String(PG_POOL_MAX)
		process.env.LOG_LEVEL = 'silent'

		const dbModule = await import('../../db/index.js')
		closePool = () => dbModule.pgPool.end()
		const { memoryStorage } = await import('../../services/storage/adapters/memory.js')
		const { seedBench } = await import('./seed.js')

		const versionRows = await dbModule.pgPool.query<{ server_version: string }>('show server_version')
		const postgres = versionRows.rows[0]?.server_version ?? null

		const scale = args.quick ? 'quick' : 'prod'
		const started = performance.now()
		const seed = await seedBench({ db: dbModule.db, memory: memoryStorage }, { scale })
		console.error(`bench: seed ${scale} ready in ${Math.round(performance.now() - started)} ms`)

		const poolProbe = instrumentPool(dbModule.pgPool)
		const storageProbe = instrumentStorage(memoryStorage, { readDelayMs: 0 })

		report = { mode: scale, env: environment(postgres), seed: seedSummary(seed) }
		if (args.only) report.only = args.only

		if (!args.only) {
			const accounts = [{ name: 'admin', userId: seed.admin.id }]
			if (seed.teacher) accounts.push({ name: 'teacher', userId: seed.teacher.id })
			report.search = await measureSearch(poolProbe, accounts, {
				queries: args.quick ? SEARCH_QUERIES.slice(0, 1) : SEARCH_QUERIES,
				runs: args.quick ? QUICK_SEARCH_RUNS : SEARCH_RUNS,
			})
			console.error('bench: search done')
		}

		if (!args.quick) {
			const app = (await import('../../app.js')).default
			const { startTestServer } = await import('../../test-support/http.js')
			const server = await startTestServer(app)
			closeServer = server.close
			report.prompts = await measurePrompts(poolProbe, storageProbe, seed, server.baseUrl, {
				readDelayMs: args.readDelayMs,
				runs: args.runs,
			})
			console.error('bench: prompts done')
			if (!args.only) {
				report.zip = await measureZip(poolProbe, storageProbe, seed)
				console.error('bench: zip done')
			}
		}
		storageProbe.restore()
		poolProbe.restore()
	} finally {
		if (closeServer) await closeServer()
		if (closePool) await closePool()
		await scratch.drop()
	}

	const json = `${JSON.stringify(report, null, '\t')}\n`
	if (args.out) {
		const target = path.resolve(REPO_ROOT, args.out)
		fs.mkdirSync(path.dirname(target), { recursive: true })
		fs.writeFileSync(target, json)
		console.error(`bench: wrote ${path.relative(REPO_ROOT, target)}`)
	}
	process.stdout.write(json, () => process.exit(0))
}

main().catch((error: unknown) => {
	console.error('bench failed:', error instanceof Error ? error.message : String(error))
	process.exit(1)
})
