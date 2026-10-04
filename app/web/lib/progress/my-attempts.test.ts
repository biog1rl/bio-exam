import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'

import { loadMyProgressAttempts, MY_ATTEMPTS_PAGE, type FetchAttemptsPage } from './my-attempts'

function testItem(overrides: Partial<PublicTestListItem> = {}): PublicTestListItem {
	return {
		id: 'test-1',
		slug: 'cell',
		title: 'Клетка',
		description: null,
		timeLimitMinutes: null,
		passingScore: null,
		topicId: 'topic-1',
		topicSlug: 'cytology',
		topicTitle: 'Цитология',
		questionsCount: 3,
		...overrides,
	}
}

function summary(index: number): TestAttemptSummary {
	return {
		id: `attempt-${index}`,
		earnedPoints: index % 10,
		totalPoints: 10,
		scorePercentage: (index % 10) * 10,
		passed: index % 2 === 0,
		submittedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
	}
}

function pagedSource(total: number, calls: { testId: string; offset?: number; limit?: number }[]): FetchAttemptsPage {
	const rows = Array.from({ length: total }, (_, index) => summary(index))
	return async (testId, options) => {
		calls.push({ testId, ...options })
		const offset = options?.offset ?? 0
		const limit = options?.limit ?? 5
		return { rows: rows.slice(offset, offset + limit), total }
	}
}

describe('loadMyProgressAttempts', () => {
	test('без тестов — пустой результат без запросов', async () => {
		const calls: { testId: string }[] = []
		assert.deepEqual(await loadMyProgressAttempts([], pagedSource(3, calls)), [])
		assert.equal(calls.length, 0)
	})

	test('150 попыток — две страницы по 100', async () => {
		const calls: { testId: string; offset?: number; limit?: number }[] = []
		const result = await loadMyProgressAttempts([testItem()], pagedSource(150, calls))
		assert.equal(MY_ATTEMPTS_PAGE, 100)
		assert.deepEqual(calls, [
			{ testId: 'test-1', offset: 0, limit: 100 },
			{ testId: 'test-1', offset: 100, limit: 100 },
		])
		assert.equal(result.length, 150)
		assert.equal(new Set(result.map((item) => item.attemptId)).size, 150)
	})

	test('пустая страница останавливает цикл, даже если total больше', async () => {
		const calls: { testId: string; offset?: number }[] = []
		const fetchPage: FetchAttemptsPage = async (testId, options) => {
			calls.push({ testId, offset: options?.offset })
			return options?.offset === 0 ? { rows: [summary(1), summary(2)], total: 500 } : { rows: [], total: 500 }
		}
		const result = await loadMyProgressAttempts([testItem()], fetchPage)
		assert.equal(result.length, 2)
		assert.deepEqual(
			calls.map((call) => call.offset),
			[0, 2]
		)
	})

	test('поля попытки берутся из теста и строки', async () => {
		const test1 = testItem({
			id: 'test-1',
			slug: 'cell',
			title: 'Клетка',
			topicSlug: 'cytology',
			topicTitle: 'Цитология',
		})
		const test2 = testItem({ id: 'test-2', slug: 'leaf', title: 'Лист', topicSlug: 'botany', topicTitle: 'Ботаника' })
		const row = summary(7)
		const fetchPage: FetchAttemptsPage = async (testId) =>
			testId === 'test-2' ? { rows: [row], total: 1 } : { rows: [], total: 0 }
		const result = await loadMyProgressAttempts([test1, test2], fetchPage)
		assert.deepEqual(result, [
			{
				attemptId: row.id,
				testId: 'test-2',
				testTitle: 'Лист',
				testSlug: 'leaf',
				topicSlug: 'botany',
				topicTitle: 'Ботаника',
				submittedAt: row.submittedAt,
				earnedPoints: row.earnedPoints,
				totalPoints: row.totalPoints,
				scorePercentage: row.scorePercentage,
				passed: row.passed,
			},
		])
	})

	test('ошибка запроса по одному тесту отклоняет промис', async () => {
		const failure = new Error('network down')
		const fetchPage: FetchAttemptsPage = async (testId) => {
			if (testId === 'test-2') throw failure
			return { rows: [summary(1)], total: 1 }
		}
		await assert.rejects(loadMyProgressAttempts([testItem(), testItem({ id: 'test-2' })], fetchPage), failure)
	})
})
