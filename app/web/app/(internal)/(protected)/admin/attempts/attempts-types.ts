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
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

export type AdminAttemptsTopicFacet = { slug: string; title: string }

export type AdminAttemptsStudentFacet = { id: string; name: string; isActive: boolean }

export type AdminAttemptsResponse = {
	rows: AdminAttemptListItem[]
	total: number
	limit: number
	offset: number
	summary: { passed: number; averageScore: number | null }
	scopeTotal: number
	facets: { topics: AdminAttemptsTopicFacet[]; students: AdminAttemptsStudentFacet[] }
}
