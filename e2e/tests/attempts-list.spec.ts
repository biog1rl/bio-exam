import type { Route } from '@playwright/test'

import { expect, test } from '../fixtures/exam'

const LIST_PATH = '/api/tests/admin/attempts'
const MOCK_QUERY = 'e2e-показать-ещё'

function attempt(id: string, title: string) {
	return {
		attemptId: id,
		testId: '00000000-0000-4000-8000-000000000001',
		testTitle: title,
		testSlug: 'mock-test',
		topicSlug: 'mock-topic',
		topicTitle: 'Тема догрузки',
		studentId: '00000000-0000-4000-8000-000000000002',
		studentIsActive: true,
		studentName: 'Ученик догрузки',
		submittedAt: '2026-10-01T10:00:00.000Z',
		earnedPoints: 1,
		totalPoints: 2,
		scorePercentage: 50,
		passed: false,
	}
}

const FIRST = attempt('00000000-0000-4000-8000-0000000000a1', 'Первая страница догрузки')
const SECOND = attempt('00000000-0000-4000-8000-0000000000a2', 'Вторая страница догрузки')

function page(rows: unknown[], offset: number) {
	return {
		rows,
		total: 2,
		limit: 50,
		offset,
		summary: { passed: 0, averageScore: 50 },
		scopeTotal: 2,
		facets: { topics: [], students: [] },
	}
}

test.describe('attempts list: server filters and «Показать ещё»', () => {
	test('search goes to the server and an unknown query shows the empty state', async ({ adminPage: browserPage }) => {
		await browserPage.goto('/admin/attempts')
		await expect(browserPage.getByRole('heading', { level: 1, name: 'Попытки студентов' })).toBeVisible()

		const query = `нет-такой-попытки-${Date.now()}`
		const searched = browserPage.waitForRequest((request) => {
			const url = new URL(request.url())
			return url.pathname === LIST_PATH && url.searchParams.get('q') === query
		})
		await browserPage.getByPlaceholder('Поиск по студенту, тесту, теме').fill(query)
		const request = await searched
		expect(new URL(request.url()).searchParams.get('status')).toBe('active')
		await expect(browserPage.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible()

		await browserPage.getByRole('button', { name: 'Сбросить' }).click()
		await expect(browserPage.getByRole('heading', { name: 'Ничего не найдено' })).toHaveCount(0)
	})

	test('«Показать ещё» appends the next page, keeps rows after a failure and hides at total', async ({
		adminPage: browserPage,
	}) => {
		let nextPageCalls = 0
		await browserPage.route(
			(url) => url.pathname === LIST_PATH && url.searchParams.get('q') === MOCK_QUERY,
			async (route: Route) => {
				const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
				if (offset === 0) return route.fulfill({ json: page([FIRST], 0) })
				nextPageCalls += 1
				if (nextPageCalls === 1) return route.fulfill({ status: 500, json: { error: 'boom' } })
				return route.fulfill({ json: page([SECOND], offset) })
			}
		)

		await browserPage.goto('/admin/attempts')
		await expect(browserPage.getByRole('heading', { level: 1, name: 'Попытки студентов' })).toBeVisible()
		await browserPage.getByPlaceholder('Поиск по студенту, тесту, теме').fill(MOCK_QUERY)

		const firstRow = browserPage.locator(`a[href="/admin/attempts/${FIRST.attemptId}"]`)
		const secondRow = browserPage.locator(`a[href="/admin/attempts/${SECOND.attemptId}"]`)
		const more = browserPage.getByRole('button', { name: 'Показать ещё' })
		await expect(firstRow).toBeVisible()
		await expect(browserPage.getByText('1 из 2')).toBeVisible()

		const failed = browserPage.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === LIST_PATH && new URL(response.url()).searchParams.get('offset') === '1'
		)
		await more.click()
		await failed
		const failureToast = browserPage.getByText('Не удалось загрузить попытки')
		await expect(failureToast).toBeVisible()
		await expect(firstRow).toBeVisible()
		await expect(more).toBeEnabled()

		await browserPage.mouse.move(0, 0)
		await expect(failureToast).toBeHidden({ timeout: 10_000 })
		await more.click()
		await expect(secondRow).toBeVisible()
		await expect(firstRow).toBeVisible()
		await expect(more).toHaveCount(0)
		expect(nextPageCalls).toBe(2)
	})
})
