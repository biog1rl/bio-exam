import type { Test, Topic } from '../../types'

export type TopicStats = {
	totalTests: number
	publishedTests: number
	draftTests: number
	totalQuestions: number
	timedTests: number
}

export function formatAdminTopicDate(value?: string | null) {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function getTopicTests(tests: Test[], topic: Topic | null, topicSlug: string) {
	if (!topic) return tests.filter((test) => test.topicSlug === topicSlug)
	return tests.filter((test) => test.topicId === topic.id || test.topicSlug === topic.slug)
}

export function getTopicStats(tests: Test[]): TopicStats {
	const publishedTests = tests.filter((test) => test.isPublished).length

	return {
		totalTests: tests.length,
		publishedTests,
		draftTests: tests.length - publishedTests,
		totalQuestions: tests.reduce((sum, test) => sum + (test.questionsCount ?? 0), 0),
		timedTests: tests.filter((test) => Boolean(test.timeLimitMinutes)).length,
	}
}
