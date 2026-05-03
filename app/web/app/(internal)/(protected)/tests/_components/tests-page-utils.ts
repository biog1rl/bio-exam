import type { PublicTestListItem } from '@/lib/tests/types'

export type PublicTestsStats = {
	totalTests: number
	totalTopics: number
	totalQuestions: number
	timedTests: number
}

export type PublicTestsTopicGroup = {
	topicId: string
	topicSlug: string
	topicTitle: string
	tests: PublicTestListItem[]
	questionsCount: number
	timedTests: number
}

export function groupPublicTestsByTopic(tests: PublicTestListItem[]): PublicTestsTopicGroup[] {
	const grouped = tests.reduce<Record<string, PublicTestsTopicGroup>>((acc, test) => {
		if (!acc[test.topicId]) {
			acc[test.topicId] = {
				topicId: test.topicId,
				topicSlug: test.topicSlug,
				topicTitle: test.topicTitle,
				tests: [],
				questionsCount: 0,
				timedTests: 0,
			}
		}

		acc[test.topicId].tests.push(test)
		acc[test.topicId].questionsCount += test.questionsCount
		if (test.timeLimitMinutes) acc[test.topicId].timedTests += 1
		return acc
	}, {})

	return Object.values(grouped)
}

export function getPublicTestsStats(groups: PublicTestsTopicGroup[]): PublicTestsStats {
	const tests = groups.flatMap((group) => group.tests)

	return {
		totalTests: tests.length,
		totalTopics: groups.length,
		totalQuestions: tests.reduce((sum, test) => sum + test.questionsCount, 0),
		timedTests: tests.filter((test) => Boolean(test.timeLimitMinutes)).length,
	}
}
