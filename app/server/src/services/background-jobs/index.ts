import {
	FINALIZE_DEADLINES_BATCH,
	FINALIZE_DEADLINES_INTERVAL_MS,
	FINALIZE_DEADLINES_JOB,
	FINALIZE_FAILURE_COOLDOWN_MS,
	FINALIZE_RUN_BUDGET_MS,
	finalizeDeadlinesJob,
	RECONCILE_OUTCOMES_JOB,
	reconcileOutcomesJob,
} from './jobs.js'
import { createJobRunner, type JobRunner, type JobRunnerOptions } from './registry.js'

export function createBackgroundJobs(options: JobRunnerOptions): JobRunner {
	const runner = createJobRunner(options)
	runner.register(finalizeDeadlinesJob({ log: options.log }))
	runner.register(reconcileOutcomesJob({ log: options.log }))
	return runner
}

export {
	createJobRunner,
	FINALIZE_DEADLINES_BATCH,
	FINALIZE_DEADLINES_INTERVAL_MS,
	FINALIZE_DEADLINES_JOB,
	FINALIZE_FAILURE_COOLDOWN_MS,
	FINALIZE_RUN_BUDGET_MS,
	finalizeDeadlinesJob,
	RECONCILE_OUTCOMES_JOB,
	reconcileOutcomesJob,
}
export {
	JOB_LOCK_NAMESPACE,
	type Job,
	type JobLog,
	type JobReport,
	type JobRunner,
	type JobRunnerOptions,
	type JobRunResult,
} from './registry.js'
export type { FinalizeDeadlinesDeps } from './jobs.js'
