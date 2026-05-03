export type AdminAttemptListItem = {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string
	studentId: string
	studentName: string
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

export type AdminAttemptsResponse = {
	rows: AdminAttemptListItem[]
	total: number
	limit: number
	offset: number
}
