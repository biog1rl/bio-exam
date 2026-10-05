import type { PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { searchDatabase, type SearchExecutor, type SearchScope } from './database-search.js'

type Access = Parameters<typeof searchDatabase>[0]['access']

type Category = Exclude<SearchScope, 'all'>

const SCOPES: Category[] = ['tests', 'questions', 'users', 'groups', 'attempts']

const ADMIN_ACCESS: Access = {
	userId: '00000000-0000-4000-8000-000000000001',
	permissions: new Set<PermissionKey>(['tests.write', 'users.read', 'groups.manage_groups']),
	tests: { all: true },
	groups: { all: true },
	users: { all: true },
}

const TEACHER_LIKE_ACCESS: Access = {
	userId: '00000000-0000-4000-8000-000000000002',
	permissions: new Set<PermissionKey>(['tests.write']),
	tests: { all: false, topicIds: ['00000000-0000-4000-8000-0000000000aa'] },
	groups: { all: false, groupIds: [] },
	users: { all: false, groupIds: [] },
}

function categoryOf(sqlText: string): Category {
	if (sqlText.includes('from question_search_documents')) return 'questions'
	if (sqlText.includes('from users u')) return 'users'
	if (sqlText.includes('from student_groups sg')) return 'groups'
	if (sqlText.includes('from test_attempts ta')) return 'attempts'
	return 'tests'
}

function seeded(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0
		return state / 2 ** 32
	}
}

function probe(delayMs: (category: Category) => number, fail?: Category) {
	const stats = { calls: 0, inFlight: 0, maxConcurrent: 0, categories: [] as Category[] }
	const executor: SearchExecutor = async (sqlText) => {
		const category = categoryOf(sqlText)
		stats.calls += 1
		stats.categories.push(category)
		stats.inFlight += 1
		stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.inFlight)
		try {
			await new Promise((resolve) => setTimeout(resolve, delayMs(category)))
			if (category === fail) throw new Error(`отказ ${category}`)
			return {
				rows: [
					{
						type: 'test' as const,
						id: `${category}-row`,
						title: category,
						subtitle: null,
						snippet_source: null,
						href: `/${category}`,
						score: 1,
					},
				],
			}
		} finally {
			stats.inFlight -= 1
		}
	}
	return { stats, executor }
}

describe('searchDatabase: шов исполнителя запроса', () => {
	test('администратор: один запрос на категорию, все пять одновременно', async () => {
		const { stats, executor } = probe(() => 5)
		const result = await searchDatabase({ query: 'клетка', scope: 'all', limit: 10, access: ADMIN_ACCESS, executor })
		assert.deepEqual(
			result.categories.map((category) => [category.scope, category.available]),
			SCOPES.map((scope) => [scope, true])
		)
		assert.equal(stats.calls, 5)
		assert.equal(stats.maxConcurrent, 5)
		assert.equal(result.total, 5)
	})

	test('случайные задержки, 20 прогонов: порядок категорий фиксирован, у каждой строки своего запроса', async () => {
		const random = seeded(20260805)
		for (let run = 0; run < 20; run += 1) {
			const { stats, executor } = probe(() => Math.floor(random() * 15))
			const result = await searchDatabase({ query: 'клетка', scope: 'all', limit: 10, access: ADMIN_ACCESS, executor })
			assert.deepEqual(
				result.categories.map((category) => category.scope),
				SCOPES,
				`прогон ${run}`
			)
			for (const category of result.categories) {
				assert.deepEqual(
					category.items.map((item) => item.id),
					[`${category.scope}-row`],
					`прогон ${run}: ${category.scope}`
				)
			}
			assert.equal(stats.calls, 5)
			assert.equal(stats.maxConcurrent, 5)
		}
	})

	test('без users.read и groups.manage_groups: недоступные категории без запроса, одновременно три', async () => {
		const { stats, executor } = probe(() => 5)
		const result = await searchDatabase({
			query: 'клетка',
			scope: 'all',
			limit: 10,
			access: TEACHER_LIKE_ACCESS,
			executor,
		})
		assert.deepEqual(
			result.categories.map((category) => [category.scope, category.available, category.items.length]),
			[
				['tests', true, 1],
				['questions', true, 1],
				['users', false, 0],
				['groups', false, 0],
				['attempts', true, 1],
			]
		)
		assert.deepEqual([...stats.categories].sort(), ['attempts', 'questions', 'tests'])
		assert.equal(stats.calls, 3)
		assert.equal(stats.maxConcurrent, 3)
	})

	test('ошибка категории users отклоняет весь вызов', async () => {
		const { executor } = probe(() => 5, 'users')
		await assert.rejects(
			searchDatabase({ query: 'клетка', scope: 'all', limit: 10, access: ADMIN_ACCESS, executor }),
			/отказ users/
		)
	})

	test('одна категория tests: один запрос', async () => {
		const { stats, executor } = probe(() => 5)
		const result = await searchDatabase({ query: 'клетка', scope: 'tests', limit: 10, access: ADMIN_ACCESS, executor })
		assert.deepEqual(
			result.categories.map((category) => category.scope),
			['tests']
		)
		assert.equal(stats.calls, 1)
		assert.equal(stats.maxConcurrent, 1)
	})

	test('запрос короче двух символов: категории без запросов', async () => {
		const { stats, executor } = probe(() => 5)
		const result = await searchDatabase({ query: ' к ', scope: 'all', limit: 10, access: ADMIN_ACCESS, executor })
		assert.deepEqual(
			result.categories.map((category) => [category.scope, category.available, category.items.length]),
			SCOPES.map((scope) => [scope, true, 0])
		)
		assert.equal(stats.calls, 0)
	})
})
