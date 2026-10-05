import type { ReviewStatus } from '@bio-exam/exam-core'

export type AdminAttemptListItem = {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string
	studentId: string
	studentIsActive: boolean
	studentName: string
	submittedAt: string
	earnedPoints: number | null
	totalPoints: number
	scorePercentage: number | null
	passed: boolean | null
	reviewStatus: ReviewStatus
	autoEarnedPoints: number
	autoTotalPoints: number
}

export type AdminAttemptsTopicFacet = { slug: string; title: string }

export type AdminAttemptsStudentFacet = { id: string; name: string; isActive: boolean }

export type AdminAttemptsResponse = {
	rows: AdminAttemptListItem[]
	total: number
	limit: number
	offset: number
	summary: { passed: number; averageScore: number | null; pendingTotal: number }
	scopeTotal: number
	facets: { topics: AdminAttemptsTopicFacet[]; students: AdminAttemptsStudentFacet[] }
}
