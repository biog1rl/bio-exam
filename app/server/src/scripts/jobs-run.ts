import '../config/env.js'
import { pgPool } from '../db/index.js'
import logger from '../lib/logger.js'
import { createBackgroundJobs } from '../services/background-jobs/index.js'

const PREFIX = '[jobs-run]'
const LOCKED_EXIT_CODE = 75

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const jobs = createBackgroundJobs({ log: logger })
	const known = jobs.names().join(', ')
	if (args.length !== 1) {
		throw new Error(`usage: jobs:run <name>; known: ${known}`)
	}
	const [name] = args as [string]
	if (!jobs.names().includes(name)) {
		console.error(`${PREFIX} unknown job ${name}; known: ${known}`)
		process.exitCode = 1
		return
	}

	const result = await jobs.runNow(name)
	if ('skipped' in result && result.skipped === 'locked') {
		console.log(`${PREFIX} ${name}: skipped, another instance holds the lock`)
		process.exitCode = LOCKED_EXIT_CODE
		return
	}
	const entries = Object.entries(result)
	if (entries.length === 0) console.log(`${PREFIX} ${name} done`)
	for (const [key, value] of entries) console.log(`${PREFIX} ${name} ${key}=${value}`)
}

main()
	.catch((error: unknown) => {
		console.error(`${PREFIX} failed`, error)
		process.exitCode = 1
	})
	.finally(async () => {
		await pgPool.end().catch(() => undefined)
	})
