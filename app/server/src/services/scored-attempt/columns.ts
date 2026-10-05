import { testAttempts } from '../../db/schema.js'

export const attemptResultColumns = {
	reviewStatus: testAttempts.reviewStatus,
	earnedPoints: testAttempts.finalEarnedPoints,
	totalPoints: testAttempts.totalPoints,
	scorePercentage: testAttempts.finalScorePercentage,
	passed: testAttempts.finalPassed,
	autoEarnedPoints: testAttempts.earnedPoints,
	autoTotalPoints: testAttempts.autoTotalPoints,
}

const SQL_ALIASES: readonly string[] = ['ta']

export function attemptResultSql(alias: 'ta') {
	if (!SQL_ALIASES.includes(alias)) throw new Error(`attemptResultSql: unknown alias ${String(alias)}`)
	return {
		reviewStatus: `${alias}.review_status`,
		earnedPoints: `${alias}.final_earned_points`,
		totalPoints: `${alias}.total_points`,
		scorePercentage: `${alias}.final_score_percentage`,
		passed: `${alias}.final_passed`,
		autoEarnedPoints: `${alias}.earned_points`,
		autoTotalPoints: `${alias}.auto_total_points`,
	}
}
