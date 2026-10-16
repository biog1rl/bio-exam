import type { AccessSet } from './policy.js'
import { activeNonStudentIds, createDrizzleZoneLoader, studentOfAttempt, type ZoneLoaderDb } from './zone-loader.js'

export type AttemptReviewers = { studentId: string; reviewerIds: string[] }

export async function attemptReviewers(
	executor: ZoneLoaderDb,
	attemptId: string,
	accessFor: (userId: string) => Promise<AccessSet>
): Promise<AttemptReviewers | null> {
	const studentId = await studentOfAttempt(executor, attemptId)
	if (!studentId) return null
	const zones = createDrizzleZoneLoader(executor)
	const topicId = await zones.topicOfAttempt(attemptId)
	const reviewerIds: string[] = []
	for (const candidateId of await activeNonStudentIds(executor, studentId)) {
		const access = await accessFor(candidateId)
		if (!access.permissions.has('tests.read')) continue
		if (access.permissions.has('zone.all')) {
			reviewerIds.push(candidateId)
			continue
		}
		if (topicId === null || !(await zones.topicIdsOf(candidateId)).includes(topicId)) continue
		if ((await zones.studentIdsInOwnedGroups(candidateId, [studentId])).length > 0) reviewerIds.push(candidateId)
	}
	return { studentId, reviewerIds }
}
