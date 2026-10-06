import app from './app.js'
import { pgPool } from './db/index.js'
import { DEFAULTS } from './lib/constants.js'
import logger from './lib/logger.js'
import { createShutdown, SHUTDOWN_DRAIN_MS } from './lib/shutdown.js'
import { createBackgroundJobs } from './services/background-jobs/index.js'

const PORT = Number(process.env.PORT ?? DEFAULTS.PORT)

const jobs = createBackgroundJobs({ log: logger })

const server = app.listen(PORT, () => {
	logger.info({ port: PORT }, 'bio-exam API started')
	jobs.start()
})

const shutdown = createShutdown({
	server,
	jobs,
	pool: pgPool,
	drainMs: SHUTDOWN_DRAIN_MS,
	log: logger,
	exit: (code) => process.exit(code),
})

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
