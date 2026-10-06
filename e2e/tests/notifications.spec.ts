import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { sessionAccountByPrefix } from '../fixtures/accounts'
import { expect, newAccountContext, projectKey, test as base } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const test = base.extend<{ bellStudentPage: Page; notifyStudentPage: Page }>({
	bellStudentPage: async ({ browser }, use, testInfo) => {
		const login = sessionAccountByPrefix(projectKey(testInfo), 'bell-student').login
		const context = await newAccountContext(browser, testInfo, login)
		await use(await context.newPage())
		await context.close()
	},
	notifyStudentPage: async ({ browser }, use, testInfo) => {
		const login = sessionAccountByPrefix(projectKey(testInfo), 'notify-student').login
		const context = await newAccountContext(browser, testInfo, login)
		await use(await context.newPage())
		await context.close()
	},
})

test.describe.configure({ mode: 'serial' })

function bellButton(page: Page): Locator {
	return page.locator('header').getByRole('button', { name: /^Уведомления/ })
}

async function idOf(page: Page, url: string, pick: (body: never) => string): Promise<string> {
	const response = await page.request.get(url)
	expect(response.ok(), `read ${url}`).toBe(true)
	return pick((await response.json()) as never)
}

async function elementContrast(locator: Locator, foreground: 'color' | 'backgroundColor'): Promise<number> {
	return locator.evaluate((element, mode) => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) throw new Error('canvas unavailable')
		const rgba = (color: string): number[] => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = '#000'
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			const data = ctx.getImageData(0, 0, 1, 1).data
			return [data[0], data[1], data[2], data[3] / 255]
		}
		const over = (top: number[], under: number[]) =>
			[0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
		const background = (start: Element | null): number[] => {
			const chain: number[][] = []
			for (let node = start; node; node = node.parentElement) {
				const color = rgba(getComputedStyle(node).backgroundColor)
				if (color[3] > 0) chain.push(color)
				if (color[3] >= 1) break
			}
			let acc = [255, 255, 255, 1]
			for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc)
			return acc
		}
		const luminance = (color: number[]) => {
			const [r, g, b] = color.slice(0, 3).map((value) => {
				const x = value / 255
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * r + 0.7152 * g + 0.0722 * b
		}
		const style = getComputedStyle(element)
		const under = background(mode === 'color' ? element : element.parentElement)
		const front = over(rgba(mode === 'color' ? style.color : style.backgroundColor), under)
		const a = luminance(front)
		const b = luminance(under)
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
	}, foreground)
}

async function settled(locator: Locator): Promise<void> {
	await locator.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
}

function bellDialog(page: Page): Locator {
	return page.getByRole('dialog', { name: 'Уведомления' })
}

async function openBell(page: Page): Promise<Locator> {
	const bell = bellButton(page)
	await expect(bell).toHaveAccessibleName(/^Уведомления/)
	await bell.click()
	const dialog = bellDialog(page)
	await expect(dialog).toBeVisible()
	await settled(dialog)
	return dialog
}

async function listScroll(dialog: Locator): Promise<{ scrollHeight: number; clientHeight: number }> {
	return dialog.evaluate((element) => {
		const list = [...element.querySelectorAll('*')].find((node) => getComputedStyle(node).overflowY === 'auto')
		if (!list) throw new Error('no scroll container')
		return { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight }
	})
}

async function assignNotifyTest(admin: Page, student: Page, testInfo: TestInfo): Promise<void> {
	const key = projectKey(testInfo)
	const testId = await idOf(
		admin,
		`/api/tests/by-slug/e2e-notif/notify-test-${key}`,
		(body: { test: { id: string } }) => body.test.id
	)
	const userId = await idOf(student, '/api/auth/me', (body: { user: { id: string } }) => body.user.id)
	const response = await admin.request.post(`/api/tests/${testId}/assignments`, { data: { userId } })
	expect(response.ok(), 'assign notify test').toBe(true)
}

test.describe('notify-student', () => {
	test('the list is empty before any event and «Прочитать все» is inactive', async ({ notifyStudentPage: page }) => {
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		await expect(dialog.getByText('Уведомлений пока нет')).toBeVisible()
		await expect(dialog.getByText('Новые события появятся здесь.')).toBeVisible()
		await expect(dialog.getByRole('button', { name: 'Прочитать все' })).toHaveAttribute('aria-disabled', 'true')
	})

	test('a test assigned through the API shows 1 on the bell and in the tab title', async ({
		adminPage,
		notifyStudentPage: page,
	}, testInfo) => {
		await assignNotifyTest(adminPage, page, testInfo)
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveAccessibleName('Уведомления, 1 непрочитанное')
		await expect(bell).toHaveText('1')
		await expect(page).toHaveTitle(/^\(1\) /)
	})
})

test.describe('bell-student', () => {
	test('more than nine unread shows 9+ and the exact number in the name', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveAccessibleName('Уведомления, 21 непрочитанное')
		await expect(bell).toHaveText('9+')
		expect(await elementContrast(bell.locator('span[aria-hidden="true"]'), 'color')).toBeGreaterThanOrEqual(4.5)
	})

	test('the tab title keeps one prefix after a client-side navigation', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		await expect(page).toHaveTitle(/^\(9\+\) /)
		await page.goto('/sitemap')
		await expect(page).toHaveTitle(/^\(9\+\) /)
		await page
			.locator('main')
			.getByRole('link', { name: /Тесты для прохождения/ })
			.click()
		await expect(page).toHaveURL(/\/tests$/)
		await expect(page).toHaveTitle(/^\(9\+\) .*Тесты/)
		await expect(page).not.toHaveTitle(/\(9\+\) \(9\+\)/)
	})

	test('the header with the bell and search fits 375 px and the number is not clipped', async ({
		bellStudentPage: page,
	}) => {
		await page.setViewportSize({ width: 375, height: 800 })
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveText('9+')
		expect(await horizontalOverflow(page)).toEqual([])
		const box = await bell.locator('span[aria-hidden="true"]').boundingBox()
		if (!box) throw new Error('no badge box')
		expect(box.x).toBeGreaterThanOrEqual(0)
		expect(box.y).toBeGreaterThanOrEqual(0)
		expect(box.x + box.width).toBeLessThanOrEqual(375)
	})

	test('the bell opens a list of the 20 latest events', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		await expect(dialog.getByRole('heading', { name: 'Уведомления' })).toBeVisible()
		const links = dialog.getByRole('link')
		await expect(links).toHaveCount(20)
		for (const link of await links.all()) {
			await expect(link).toHaveAttribute('href', /^\/notifications\/[0-9a-f-]{36}$/)
			await expect(link).toContainText(/Вам назначен тест|Новое уведомление/)
		}
	})

	test('«Показать ещё» loads the last event and moves focus to it', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		const links = dialog.getByRole('link')
		await expect(links).toHaveCount(20)
		await dialog.getByRole('button', { name: 'Показать ещё' }).click()
		await expect(links).toHaveCount(21)
		await expect(links.filter({ hasText: 'Новое уведомление' })).toHaveCount(1)
		await expect(dialog.getByRole('button', { name: 'Показать ещё' })).toHaveCount(0)
		await expect(links.nth(20)).toBeFocused()
	})

	test('the keyboard opens the list, tabs to «Прочитать все» and Esc returns to the bell', async ({
		bellStudentPage: page,
	}) => {
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveAccessibleName('Уведомления, 21 непрочитанное')
		await bell.focus()
		await page.keyboard.press('Enter')
		const dialog = bellDialog(page)
		await expect(dialog).toBeVisible()
		await expect(dialog.getByRole('heading', { name: 'Уведомления' })).toBeFocused()
		await expect(dialog.getByRole('link')).toHaveCount(20)
		await page.keyboard.press('Tab')
		await expect(dialog.getByRole('button', { name: 'Прочитать все' })).toBeFocused()
		await page.keyboard.press('Tab')
		await expect(dialog.getByRole('link').first()).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(dialog).toBeHidden()
		await expect(bell).toBeFocused()
	})

	test('the list fits the window and scrolls inside on 1280, 768 and 375 px', async ({ bellStudentPage: page }) => {
		for (const width of [1280, 768, 375]) {
			await page.setViewportSize({ width, height: 700 })
			await page.goto('/dashboard')
			const dialog = await openBell(page)
			await expect(dialog.getByRole('link')).toHaveCount(20)
			const box = await dialog.boundingBox()
			if (!box) throw new Error('no dialog box')
			expect(box.x, `x at ${width}`).toBeGreaterThanOrEqual(0)
			expect(box.y, `y at ${width}`).toBeGreaterThanOrEqual(0)
			expect(box.x + box.width, `right at ${width}`).toBeLessThanOrEqual(width)
			expect(box.y + box.height, `bottom at ${width}`).toBeLessThanOrEqual(700)
			expect(box.height, `height at ${width}`).toBeLessThanOrEqual(512.5)
			const scroll = await listScroll(dialog)
			expect(scroll.scrollHeight, `scroll at ${width}`).toBeGreaterThan(scroll.clientHeight)
			await dialog.getByRole('link').last().scrollIntoViewIfNeeded()
			const heading = dialog.getByRole('heading', { name: 'Уведомления' })
			await expect(heading).toBeInViewport()
			const headingBox = await heading.boundingBox()
			if (!headingBox) throw new Error('no heading box')
			expect(headingBox.y, `heading at ${width}`).toBeGreaterThanOrEqual(box.y)
			expect(await horizontalOverflow(page), `overflow at ${width}`).toEqual([])
			expect(await lowContrastTexts(page), `contrast at ${width}`).toEqual([])
		}
	})

	test('a long title wraps inside three lines and does not widen the list', async ({ bellStudentPage: page }) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		const box = await dialog.boundingBox()
		if (!box) throw new Error('no dialog box')
		expect(box.width).toBeCloseTo(384, 0)
		await expect(dialog.getByRole('link')).toHaveCount(20)
		await dialog.getByRole('button', { name: 'Показать ещё' }).click()
		await expect(dialog.getByRole('link')).toHaveCount(21)
		const long = dialog.getByRole('link').filter({ hasText: 'суперпозиционноеразличиемембранныхорганоидов' })
		await expect(long).toHaveCount(1)
		await long.scrollIntoViewIfNeeded()
		const longBox = await long.boundingBox()
		if (!longBox) throw new Error('no row box')
		expect(longBox.x + longBox.width).toBeLessThanOrEqual(box.x + box.width)
		expect(longBox.height).toBeLessThanOrEqual(100)
		expect(await long.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
		expect((await dialog.boundingBox())?.width).toBeCloseTo(384, 0)
	})

	test('the number on the bell and the unread dot keep their contrast, also under hover', async ({
		bellStudentPage: page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveText('9+')
		expect(await elementContrast(bell.locator('span[aria-hidden="true"]'), 'color')).toBeGreaterThanOrEqual(4.5)
		const dialog = await openBell(page)
		const row = dialog.getByRole('link').first()
		const dot = row.locator('span[aria-hidden="true"] > span')
		expect(await elementContrast(dot, 'backgroundColor')).toBeGreaterThanOrEqual(3)
		await row.hover()
		await settled(row)
		expect(await elementContrast(dot, 'backgroundColor')).toBeGreaterThanOrEqual(3)
		expect(await lowContrastTexts(page)).toEqual([])
	})

	test('a failed first load shows an error and «Повторить» brings the rows back', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления, 21 непрочитанное')
		const match = (url: URL) => url.pathname === '/api/notifications' && !url.searchParams.has('cursor')
		const handler = (route: Route) => route.fulfill({ status: 500, json: { error: 'boom' } })
		await page.route(match, handler)
		const dialog = await openBell(page)
		await expect(dialog.getByText('Не удалось загрузить уведомления')).toBeVisible()
		await page.unroute(match, handler)
		await dialog.getByRole('button', { name: 'Повторить' }).click()
		await expect(dialog.getByRole('link')).toHaveCount(20)
	})

	test('a failed «Показать ещё» keeps the rows and «Повторить» repeats the same page', async ({
		bellStudentPage: page,
	}) => {
		await page.goto('/dashboard')
		const match = (url: URL) => url.pathname === '/api/notifications' && url.searchParams.has('cursor')
		const handler = (route: Route) => route.fulfill({ status: 500, json: { error: 'boom' } })
		await page.route(match, handler)
		const dialog = await openBell(page)
		await expect(dialog.getByRole('link')).toHaveCount(20)
		await dialog.getByRole('button', { name: 'Показать ещё' }).click()
		await expect(dialog.getByText('Не удалось загрузить ещё уведомления')).toBeVisible()
		await expect(dialog.getByRole('link')).toHaveCount(20)
		await page.unroute(match, handler)
		await dialog.getByRole('button', { name: 'Повторить' }).click()
		await expect(dialog.getByRole('link')).toHaveCount(21)
	})

	test('a failed «Прочитать все» shows a toast and keeps the number', async ({ bellStudentPage: page }) => {
		await page.goto('/dashboard')
		const match = (url: URL) => url.pathname === '/api/notifications/read-all'
		const handler = (route: Route) => route.fulfill({ status: 500, json: { error: 'boom' } })
		await page.route(match, handler)
		const dialog = await openBell(page)
		await expect(dialog.getByRole('link')).toHaveCount(20)
		await dialog.getByRole('button', { name: 'Прочитать все' }).click()
		await expect(page.getByText('Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.')).toBeVisible()
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления, 21 непрочитанное')
		await page.unroute(match, handler)
	})

	test('«Прочитать все» clears the number, the dots and the tab prefix and keeps the focus', async ({
		bellStudentPage: page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		await expect(dialog.getByText('Непрочитанное:').first()).toBeAttached()
		const readAll = dialog.getByRole('button', { name: 'Прочитать все' })
		await readAll.click()
		const bell = bellButton(page)
		await expect(bell).toHaveAccessibleName('Уведомления')
		await expect(bell).toHaveText('')
		await expect(page).not.toHaveTitle(/^\(/)
		await expect(dialog).toBeVisible()
		await expect(readAll).toBeFocused()
		await expect(readAll).toHaveAttribute('aria-disabled', 'true')
		await expect(dialog.getByText('Непрочитанное:')).toHaveCount(0)
		await expect(dialog.getByRole('link')).toHaveCount(20)
		const row = dialog.getByRole('link').first()
		await row.hover()
		await settled(row)
		expect(await lowContrastTexts(page)).toEqual([])
	})
})
