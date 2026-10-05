import type { Route } from '@playwright/test'

import { expect, projectKey, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

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
		reviewStatus: 'none',
		autoEarnedPoints: 1,
		autoTotalPoints: 2,
	}
}

const FIRST = attempt('00000000-0000-4000-8000-0000000000a1', 'Первая страница догрузки')
const SECOND = attempt('00000000-0000-4000-8000-0000000000a2', 'Вторая страница догрузки')

const REVIEW_QUERY = 'e2e-на-проверке'

const PENDING = {
	...attempt('00000000-0000-4000-8000-0000000000b1', 'Тест на проверке'),
	earnedPoints: null,
	totalPoints: 4,
	scorePercentage: null,
	passed: null,
	reviewStatus: 'pending',
	autoEarnedPoints: 1,
	autoTotalPoints: 1,
}

const GRADED = {
	...attempt('00000000-0000-4000-8000-0000000000b2', 'Проверенный тест'),
	earnedPoints: 3,
	totalPoints: 4,
	scorePercentage: 75,
	passed: true,
	reviewStatus: 'graded',
	autoEarnedPoints: 1,
	autoTotalPoints: 1,
}

function page(
	rows: unknown[],
	offset: number,
	summary: { passed: number; averageScore: number | null; pendingTotal: number } = {
		passed: 0,
		averageScore: 50,
		pendingTotal: 0,
	}
) {
	return {
		rows,
		total: 2,
		limit: 50,
		offset,
		summary,
		scopeTotal: 2,
		facets: { topics: [], students: [] },
	}
}

test.describe('attempts list: server filters and «Показать ещё»', () => {
	test('search goes to the server and an unknown query shows the empty state', async ({ adminPage: browserPage }) => {
		await browserPage.goto('/admin/attempts')
		await expect(browserPage.getByRole('heading', { level: 1, name: 'Попытки', exact: true })).toBeVisible()

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

	test('filters come from the address and the address follows the filters', async ({ adminPage: browserPage }) => {
		await browserPage.goto('/admin/attempts?topic=e2e-no-such-topic')
		await expect(browserPage.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible()
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?topic=e2e-no-such-topic$/)

		await browserPage.goto('/admin/attempts?status=all')
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?status=all$/)
		await browserPage.getByRole('button', { name: 'Сбросить' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
	})

	test('a filter picked on the page resets when the menu opens the bare list again', async ({
		adminPage: browserPage,
	}, testInfo) => {
		await browserPage.goto('/admin/attempts')
		await browserPage.getByRole('button', { name: 'Статус студентов' }).click()
		await browserPage.getByRole('menuitemradio', { name: 'Все' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?status=all$/)
		await expect(browserPage.getByRole('button', { name: 'Сбросить' })).toBeEnabled()

		if (projectKey(testInfo) === 'mobile') await browserPage.getByRole('button', { name: 'Открыть меню' }).click()
		await browserPage
			.getByRole('navigation', { name: 'Основная навигация' })
			.getByRole('link', { name: 'Попытки', exact: true })
			.click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(browserPage.locator('button:enabled', { hasText: 'Сбросить' })).toHaveCount(0)
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
		await expect(browserPage.getByRole('heading', { level: 1, name: 'Попытки', exact: true })).toBeVisible()
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

	test('a pending attempt shows the chip without a percent and the review filter follows the tile', async ({
		adminPage: browserPage,
	}) => {
		await browserPage.route(
			(url) => url.pathname === LIST_PATH && url.searchParams.get('q') === REVIEW_QUERY,
			async (route: Route) => {
				const review = new URL(route.request().url()).searchParams.get('review')
				if (review === 'pending') {
					return route.fulfill({
						json: {
							...page([PENDING], 0, { passed: 0, averageScore: null, pendingTotal: 1 }),
							total: 1,
						},
					})
				}
				return route.fulfill({ json: page([PENDING, GRADED], 0, { passed: 1, averageScore: 75, pendingTotal: 1 }) })
			}
		)

		await browserPage.goto('/admin/attempts')
		await expect(browserPage.getByRole('heading', { level: 1, name: 'Попытки', exact: true })).toBeVisible()
		await browserPage.getByPlaceholder('Поиск по студенту, тесту, теме').fill(REVIEW_QUERY)

		const pendingRow = browserPage.locator(`a[href="/admin/attempts/${PENDING.attemptId}"]`)
		const gradedRow = browserPage.locator(`a[href="/admin/attempts/${GRADED.attemptId}"]`)
		await expect(pendingRow).toBeVisible()
		await expect(pendingRow).toContainText('На проверке')
		await expect(pendingRow).toContainText('авто 1 из 1')
		await expect(pendingRow).not.toContainText('%')
		await expect(pendingRow).not.toContainText('Пройден')
		await expect(pendingRow).not.toContainText('Не пройден')
		await expect(gradedRow).toContainText('проверено учителем')
		await expect(gradedRow).toContainText('75%')

		const marks = browserPage.getByText(/^(На проверке|проверено учителем)$/)
		await expect(marks.first()).toBeVisible()
		const lowContrast = (await lowContrastTexts(browserPage)).filter((text) => /проверк|авто|учителем/.test(text))
		expect(lowContrast).toEqual([])
		expect(await horizontalOverflow(browserPage)).toEqual([])

		const tile = browserPage.getByRole('button', { name: '1 на проверке' })
		const select = browserPage.getByRole('combobox', { name: 'Проверка' })
		await expect(tile).toHaveAttribute('aria-pressed', 'false')
		await expect(select).toHaveText('Проверка: все')

		await tile.click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?review=pending$/)
		await expect(select).toHaveText('На проверке')
		await expect(tile).toHaveAttribute('aria-pressed', 'true')
		await expect(gradedRow).toHaveCount(0)
		const averageTile = browserPage.getByText('средний результат').locator('..')
		await expect(averageTile).toContainText('—')
		await expect(averageTile).toContainText('без попыток на проверке')

		await tile.click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(select).toHaveText('Проверка: все')
		await expect(gradedRow).toBeVisible()
	})

	test('the review filter lives in the address, resets with «Сбросить» and has its own empty states', async ({
		adminPage: browserPage,
	}) => {
		await browserPage.goto('/admin/attempts?review=pending')
		await expect(browserPage.getByRole('combobox', { name: 'Проверка' })).toHaveText('На проверке')
		await expect(browserPage.getByRole('heading', { name: 'Нет попыток на проверке' })).toBeVisible()
		await expect(
			browserPage.getByText('Здесь появятся сданные попытки, в которых есть ответы, ожидающие проверки учителем.')
		).toBeVisible()

		await browserPage.goto('/admin/attempts?review=graded')
		await expect(browserPage.getByRole('heading', { name: 'Нет проверенных попыток' })).toBeVisible()

		await browserPage.goto('/admin/attempts?review=graded&topic=e2e-no-such-topic')
		await expect(browserPage.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible()

		await browserPage.getByRole('button', { name: 'Сбросить' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(browserPage.getByRole('combobox', { name: 'Проверка' })).toHaveText('Проверка: все')
		await expect(browserPage.getByRole('button', { name: '0 на проверке' })).toBeDisabled()
	})
})
