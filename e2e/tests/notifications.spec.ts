import type { Locator, Page, TestInfo } from '@playwright/test'

import { sessionAccountByPrefix } from '../fixtures/accounts'
import { expect, newAccountContext, projectKey, test as base } from '../fixtures/exam'
import { horizontalOverflow } from '../fixtures/page-checks'

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

async function badgeContrast(badge: Locator): Promise<number> {
	return badge.evaluate((element) => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) throw new Error('canvas unavailable')
		const rgb = (color: string): number[] => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = '#000'
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			const data = ctx.getImageData(0, 0, 1, 1).data
			return [data[0], data[1], data[2]]
		}
		const luminance = (color: number[]) => {
			const [r, g, b] = color.map((value) => {
				const x = value / 255
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * r + 0.7152 * g + 0.0722 * b
		}
		const style = getComputedStyle(element)
		const text = luminance(rgb(style.color))
		const fill = luminance(rgb(style.backgroundColor))
		return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05)
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
		expect(await badgeContrast(bell.locator('span[aria-hidden="true"]'))).toBeGreaterThanOrEqual(4.5)
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
})
