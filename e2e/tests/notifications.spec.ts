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

async function openFirstUnreadRow(page: Page): Promise<void> {
	const dialog = await openBell(page)
	await expect(dialog.getByRole('link')).toHaveCount(20)
	await dialog.getByRole('link').filter({ hasText: 'Непрочитанное:' }).first().click()
}

function unreadFromName(name: string | null): number {
	const match = /(\d+)/.exec(name ?? '')
	if (!match) throw new Error(`no number in «${name}»`)
	return Number(match[1])
}

async function listScroll(dialog: Locator): Promise<{ scrollHeight: number; clientHeight: number }> {
	return dialog.evaluate((element) => {
		const list = [...element.querySelectorAll('*')].find((node) => getComputedStyle(node).overflowY === 'auto')
		if (!list) throw new Error('no scroll container')
		return { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight }
	})
}

async function notifyTestId(admin: Page, testInfo: TestInfo, kind: 'test' | 'draft' = 'test'): Promise<string> {
	return idOf(
		admin,
		`/api/tests/by-slug/e2e-notif/notify-${kind}-${projectKey(testInfo)}`,
		(body: { test: { id: string } }) => body.test.id
	)
}

async function currentUserId(page: Page): Promise<string> {
	return idOf(page, '/api/auth/me', (body: { user: { id: string } }) => body.user.id)
}

async function assignTo(admin: Page, testId: string, userId: string): Promise<void> {
	const response = await admin.request.post(`/api/tests/${testId}/assignments`, { data: { userId } })
	expect(response.ok(), 'assign test').toBe(true)
}

async function unassignFrom(admin: Page, testId: string, userId: string): Promise<void> {
	const response = await admin.request.delete(`/api/tests/${testId}/assignments/${userId}`)
	expect(response.ok(), 'unassign test').toBe(true)
}

async function assignNotifyTest(admin: Page, student: Page, testInfo: TestInfo): Promise<void> {
	await assignTo(admin, await notifyTestId(admin, testInfo), await currentUserId(student))
}

async function readAll(page: Page): Promise<void> {
	const response = await page.request.post('/api/notifications/read-all')
	expect(response.ok(), 'read all').toBe(true)
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

	test('a row opens the assigned test, the number goes away and «Назад» skips the notification page', async ({
		notifyStudentPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const title = `Тест для уведомлений (${key})`
		await page.goto('/dashboard')
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления, 1 непрочитанное')
		const dialog = await openBell(page)
		await dialog.getByRole('link', { name: `Вам назначен тест «${title}»` }).click()
		await expect(page).toHaveURL(new RegExp(`/tests/e2e-notif/notify-test-${key}$`))
		await expect(page.getByRole('heading', { name: title })).toBeVisible()
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления')
		await expect(bellButton(page)).toHaveText('')
		await expect(page).not.toHaveTitle(/^\(/)
		await page.goBack()
		await expect(page).toHaveURL(/\/dashboard$/)
		expect(page.url()).not.toContain('/notifications/')
	})

	test('reassignment updates the bell on tab focus', async ({ adminPage, notifyStudentPage: page }, testInfo) => {
		const key = projectKey(testInfo)
		const testId = await notifyTestId(adminPage, testInfo)
		const userId = await currentUserId(page)
		await page.goto('/dashboard')
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления')
		await unassignFrom(adminPage, testId, userId)
		await assignTo(adminPage, testId, userId)
		const bellName = expect.poll(
			async () => {
				await page.evaluate(() => window.dispatchEvent(new Event('focus')))
				return bellButton(page).getAttribute('aria-label')
			},
			{ intervals: [1000], timeout: 20_000 }
		)
		await bellName.toBe('Уведомления, 1 непрочитанное')
		await expect(page).toHaveTitle(/^\(1\) /)
		const dialog = await openBell(page)
		const rows = dialog.getByRole('link')
		await expect(rows.first()).toContainText(`Вам назначен тест «Тест для уведомлений (${key})»`)
		await expect(rows.first().getByText('Непрочитанное:')).toBeAttached()
		await expect(dialog.getByText('Непрочитанное:')).toHaveCount(1)
		await expect(rows.filter({ hasText: `Тест для уведомлений (${key})` })).toHaveCount(1)
	})

	test('periodic refresh updates the bell without focus', async ({ adminPage, notifyStudentPage: page }, testInfo) => {
		const testId = await notifyTestId(adminPage, testInfo)
		const userId = await currentUserId(page)
		await readAll(page)
		await page.clock.install()
		const firstCount = page.waitForResponse(
			(response) => new URL(response.url()).pathname === '/api/notifications/unread-count'
		)
		await page.goto('/dashboard')
		await firstCount
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления')
		await unassignFrom(adminPage, testId, userId)
		await assignTo(adminPage, testId, userId)
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления')
		await page.clock.fastForward(3_000)
		await page.clock.fastForward(61_000)
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления, 1 непрочитанное')
		await expect(page).toHaveTitle(/^\(1\) /)
	})

	test('after the assignment is removed the row leads to «Нет доступа к материалу»', async ({
		adminPage,
		notifyStudentPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const testId = await notifyTestId(adminPage, testInfo)
		const userId = await currentUserId(page)
		await unassignFrom(adminPage, testId, userId)
		await page.goto('/dashboard')
		const dialog = await openBell(page)
		await dialog.getByRole('link', { name: `Вам назначен тест «Тест для уведомлений (${key})»` }).click()
		const main = page.locator('main')
		await expect(main.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
		await expect(main.getByText('Возможно, назначение снято.')).toBeVisible()
		await expect(main).not.toContainText('Тест для уведомлений')
	})

	test('assignment to a draft notifies only after publication (D-18)', async ({
		adminPage,
		notifyStudentPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const title = `Черновик для уведомлений (${key})`
		await readAll(page)
		const draft = await adminPage.request.get(`/api/tests/by-slug/e2e-notif/notify-draft-${key}`)
		expect(draft.ok(), 'read draft').toBe(true)
		const { id, topicId, slug } = ((await draft.json()) as { test: { id: string; topicId: string; slug: string } }).test
		await assignTo(adminPage, id, await currentUserId(page))
		await page.goto('/dashboard')
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления')
		const unread = await page.request.get('/api/notifications/unread-count')
		expect(unread.ok(), 'read unread-count').toBe(true)
		expect(await unread.json()).toEqual({ count: 0 })
		const published = await adminPage.request.patch(`/api/tests/${id}/settings`, {
			data: { topicId, title, slug, isPublished: true },
		})
		expect(published.ok(), 'publish draft').toBe(true)
		await page.reload()
		await expect(bellButton(page)).toHaveAccessibleName('Уведомления, 1 непрочитанное')
		const dialog = await openBell(page)
		await dialog.getByRole('link', { name: `Вам назначен тест «${title}»` }).click()
		await expect(page).toHaveURL(new RegExp(`/tests/e2e-notif/notify-draft-${key}$`))
		await expect(page.getByRole('heading', { name: title })).toBeVisible()
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

	test('opening a row re-checks access and shows «Нет доступа к материалу» without the object', async ({
		bellStudentPage: page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await page.goto('/dashboard')
		const bell = bellButton(page)
		await expect(bell).toHaveAccessibleName(/^Уведомления, \d+ непрочитан/)
		const before = unreadFromName(await bell.getAttribute('aria-label'))
		await openFirstUnreadRow(page)
		await expect(page).toHaveURL(/\/notifications\/[0-9a-f-]{36}$/)
		await expect(bellDialog(page)).toBeHidden()
		const main = page.locator('main')
		await expect(main.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
		await expect(main.getByText('Возможно, назначение снято.')).toBeVisible()
		await expect(main.getByRole('link', { name: 'На главную' })).toBeVisible()
		await expect(main).not.toContainText('Строение клетки')
		await expect(main).not.toContainText('Клетка')
		await expect(async () => {
			expect(unreadFromName(await bell.getAttribute('aria-label'))).toBe(before - 1)
		}).toPass()
	})

	test('the denied screen takes focus, the crumb and the tab say «Уведомление»', async ({ bellStudentPage: page }) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await page.goto('/dashboard')
		await expect(bellButton(page)).toHaveAccessibleName(/^Уведомления, \d+ непрочитан/)
		await openFirstUnreadRow(page)
		const heading = page.locator('main').getByRole('heading', { name: 'Нет доступа к материалу' })
		await expect(heading).toBeFocused()
		await expect(page.locator('header [aria-current="page"]')).toHaveText('Уведомление')
		await expect(page).toHaveTitle(/Уведомление - /)
	})

	test('an unknown id opens the same screen and «Назад» without history leads to /dashboard', async ({
		bellStudentPage: page,
	}) => {
		await page.goto('/notifications/not-a-uuid')
		await expect(page.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
		await page.getByRole('button', { name: 'Назад' }).click()
		await expect(page).toHaveURL(/\/dashboard$/)
	})

	test('a failed open shows an error and «Повторить» opens the notification again', async ({
		bellStudentPage: page,
	}) => {
		const match = (url: URL) => /^\/api\/notifications\/[^/]+\/open$/.test(url.pathname)
		const handler = (route: Route) => route.fulfill({ status: 500, json: { error: 'boom' } })
		await page.route(match, handler)
		await page.goto('/notifications/not-a-uuid')
		await expect(page.getByText('Не удалось открыть уведомление')).toBeVisible()
		await page.unroute(match, handler)
		await page.getByRole('button', { name: 'Повторить' }).click()
		await expect(page.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
	})

	test('a foreign href from the server is not followed', async ({ bellStudentPage: page }) => {
		const match = (url: URL) => /^\/api\/notifications\/[^/]+\/open$/.test(url.pathname)
		const handler = (route: Route) => route.fulfill({ status: 200, json: { href: '//evil.example/x' } })
		await page.route(match, handler)
		await page.goto('/notifications/not-a-uuid')
		await expect(page.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
		await expect(page).toHaveURL(/\/notifications\/not-a-uuid$/)
		await page.unroute(match, handler)
	})

	test('the denied screen fits 375, 768 and 1280 px', async ({ bellStudentPage: page }) => {
		for (const width of [375, 768, 1280]) {
			await page.setViewportSize({ width, height: 800 })
			await page.goto('/notifications/not-a-uuid')
			await expect(page.getByRole('heading', { name: 'Нет доступа к материалу' })).toBeVisible()
			expect(await horizontalOverflow(page), `overflow at ${width}`).toEqual([])
			expect(await lowContrastTexts(page), `contrast at ${width}`).toEqual([])
		}
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
