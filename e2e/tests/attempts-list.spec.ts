import type { Route } from '@playwright/test'

import { expect, projectKey, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const LIST_PATH = '/api/tests/admin/attempts'
const MOCK_QUERY = 'e2e-показать-ещё'
const FILTER_QUERY = 'e2e-фильтры-попыток'
const STUDENT_ID = '00000000-0000-4000-8000-000000000002'
const INACTIVE_STUDENT_ID = '00000000-0000-4000-8000-000000000003'

function attempt(id: string, title: string) {
	return {
		attemptId: id,
		testId: '00000000-0000-4000-8000-000000000001',
		testTitle: title,
		testSlug: 'mock-test',
		topicSlug: 'mock-topic',
		topicTitle: 'Тема догрузки',
		studentId: STUDENT_ID,
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
		await browserPage.getByRole('searchbox', { name: 'Поиск попыток' }).fill(query)
		const request = await searched
		expect(new URL(request.url()).searchParams.get('status')).toBe('active')
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?q=/)
		await expect(browserPage.getByText('Ничего не найдено', { exact: true })).toBeVisible()

		await browserPage.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(browserPage.getByRole('searchbox', { name: 'Поиск попыток' })).toHaveValue('')
		await expect(browserPage.getByText('Ничего не найдено', { exact: true })).toHaveCount(0)
	})

	test('filters come from the address and the address follows the filters', async ({ adminPage: browserPage }) => {
		await browserPage.goto('/admin/attempts?topic=e2e-no-such-topic')
		await expect(browserPage.getByText('Ничего не найдено', { exact: true })).toBeVisible()
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?topic=e2e-no-such-topic$/)

		await browserPage.goto('/admin/attempts?topic=e2e-no-such-topic&status=all&q=e2e')
		await expect(browserPage.getByRole('searchbox', { name: 'Поиск попыток' })).toHaveValue('e2e')
		await browserPage.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
	})

	test('a search typed on the page resets when the menu opens the bare list again', async ({
		adminPage: browserPage,
	}, testInfo) => {
		await browserPage.goto('/admin/attempts')
		const search = browserPage.getByRole('searchbox', { name: 'Поиск попыток' })
		await search.fill('e2e-сброс-меню')
		await expect(browserPage).toHaveURL(/\/admin\/attempts\?q=/)

		if (projectKey(testInfo) === 'mobile') await browserPage.getByRole('button', { name: 'Открыть меню' }).click()
		await browserPage
			.getByRole('navigation', { name: 'Основная навигация' })
			.getByRole('link', { name: 'Попытки', exact: true })
			.click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(search).toHaveValue('')
	})

	test('column filters and sort go to the server and stay in the address', async ({ adminPage: browserPage }) => {
		const requests: URLSearchParams[] = []
		await browserPage.route(
			(url) => url.pathname === LIST_PATH && url.searchParams.get('q') === FILTER_QUERY,
			async (route: Route) => {
				requests.push(new URL(route.request().url()).searchParams)
				return route.fulfill({
					json: {
						...page([FIRST, SECOND], 0),
						facets: {
							topics: [{ slug: 'mock-topic', title: 'Тема догрузки' }],
							students: [
								{ id: STUDENT_ID, name: 'Ученик догрузки', isActive: true },
								{ id: INACTIVE_STUDENT_ID, name: 'Ученик неактивный', isActive: false },
							],
						},
					},
				})
			}
		)
		const last = (name: string) => requests.at(-1)?.get(name) ?? null

		await browserPage.goto('/admin/attempts')
		await browserPage.getByRole('searchbox', { name: 'Поиск попыток' }).fill(FILTER_QUERY)
		const firstRow = browserPage
			.getByRole('row')
			.filter({ has: browserPage.locator(`a[href="/admin/attempts/${FIRST.attemptId}"]`) })
		await expect(firstRow).toContainText('Ученик догрузки')
		await expect(firstRow).toContainText('50%')

		await browserPage.getByRole('button', { name: 'Фильтр по результату' }).click()
		await browserPage.getByRole('menuitemcheckbox', { name: /^Не пройден/ }).click()
		await browserPage.keyboard.press('Escape')
		await expect(browserPage).toHaveURL(/[?&]result=failed(&|$)/)
		await expect.poll(() => last('result')).toBe('failed')

		await browserPage.getByRole('button', { name: 'Фильтр по темам' }).click()
		await browserPage.getByRole('menuitemcheckbox', { name: /^Тема догрузки/ }).click()
		await browserPage.keyboard.press('Escape')
		await expect(browserPage).toHaveURL(/[?&]topic=mock-topic(&|$)/)
		await expect.poll(() => last('topic')).toBe('mock-topic')

		const resultHead = browserPage.getByRole('columnheader', { name: /Результат/ })
		await resultHead.getByRole('button', { name: 'Результат', exact: true }).click()
		await expect(resultHead).toHaveAttribute('aria-sort', 'ascending')
		await expect(browserPage).toHaveURL(/[?&]sort=score-asc(&|$)/)
		await expect.poll(() => [last('sort'), last('dir')]).toEqual(['score', 'asc'])

		await browserPage.getByRole('button', { name: 'Фильтр по ученикам' }).click()
		await expect(browserPage.getByRole('option', { name: /^Ученик неактивный/ })).toHaveCount(0)
		await browserPage.getByRole('option', { name: /^Неактивные/ }).click()
		await expect(browserPage).toHaveURL(/[?&]status=all(&|$)/)
		await browserPage.getByRole('option', { name: /^Ученик неактивный/ }).click()
		await expect(browserPage).toHaveURL(new RegExp(`[?&]student=${INACTIVE_STUDENT_ID}(&|$)`))
		await expect.poll(() => [last('status'), last('student')]).toEqual(['all', INACTIVE_STUDENT_ID])

		await browserPage.getByRole('button', { name: 'Сбросить', exact: true }).click()
		await browserPage.keyboard.press('Escape')
		await expect(browserPage).toHaveURL(/[?&]status=all(&|$)/)
		await expect(browserPage).not.toHaveURL(/[?&]student=/)

		await firstRow.click({ position: { x: 6, y: 6 } })
		await expect(browserPage).toHaveURL(new RegExp(`/admin/attempts/${FIRST.attemptId}$`))
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
		await browserPage.getByRole('searchbox', { name: 'Поиск попыток' }).fill(MOCK_QUERY)

		const firstRow = browserPage.locator(`a[href="/admin/attempts/${FIRST.attemptId}"]`)
		const secondRow = browserPage.locator(`a[href="/admin/attempts/${SECOND.attemptId}"]`)
		const more = browserPage.getByRole('button', { name: 'Показать ещё' })
		await expect(firstRow).toBeVisible()
		await expect(browserPage.getByText(/^Показано 1 из 2$/)).toBeVisible()

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

	test('a pending attempt shows the chip without a percent and the review filter follows the toggle', async ({
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
		await browserPage.getByRole('searchbox', { name: 'Поиск попыток' }).fill(REVIEW_QUERY)

		const pendingRow = browserPage
			.getByRole('row')
			.filter({ has: browserPage.locator(`a[href="/admin/attempts/${PENDING.attemptId}"]`) })
		const gradedRow = browserPage
			.getByRole('row')
			.filter({ has: browserPage.locator(`a[href="/admin/attempts/${GRADED.attemptId}"]`) })
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

		const toggle = browserPage.getByRole('button', { name: '1 на проверке' })
		await expect(toggle).toHaveAttribute('aria-pressed', 'false')
		await toggle.click()
		await expect(browserPage).toHaveURL(/review=pending/)
		await expect(toggle).toHaveAttribute('aria-pressed', 'true')
		await expect(gradedRow).toHaveCount(0)

		await toggle.click()
		await expect(browserPage).not.toHaveURL(/review=/)
		await expect(gradedRow).toBeVisible()
	})

	test('the review filter lives in the address, resets with «Сбросить фильтры» and has its own empty states', async ({
		teacherPage: browserPage,
	}) => {
		await browserPage.goto('/admin/attempts?review=pending')
		await expect(browserPage.getByRole('button', { name: '0 на проверке' })).toHaveAttribute('aria-pressed', 'true')
		await expect(browserPage.getByText('Нет попыток на проверке')).toBeVisible()
		await expect(
			browserPage.getByText('Здесь появятся сданные попытки, в которых есть ответы, ожидающие проверки учителем.')
		).toBeVisible()

		await browserPage.goto('/admin/attempts?review=graded')
		await expect(browserPage.getByText('Нет проверенных попыток')).toBeVisible()

		await browserPage.goto('/admin/attempts?review=graded&topic=e2e-no-such-topic')
		await expect(browserPage.getByText('Ничего не найдено')).toBeVisible()

		await browserPage.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(browserPage).toHaveURL(/\/admin\/attempts$/)
		await expect(browserPage.getByRole('button', { name: /на проверке$/ })).toHaveCount(0)
	})
})
