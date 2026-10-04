import { type Browser, type BrowserContext, type TestInfo } from '@playwright/test'

import { E2E_PASSWORD, loginAccount, sessionAccount, type RoleKey } from '../fixtures/accounts'
import { expect, projectKey, test } from '../fixtures/exam'

const SESSION_COOKIE = 'bio_exam_session'
const REFRESH_COOKIE = 'refresh_token'

function baseUrlOf(testInfo: TestInfo): string {
	const baseURL = testInfo.project.use.baseURL
	if (!baseURL) throw new Error(`no baseURL in Playwright project ${testInfo.project.name}`)
	return baseURL
}

async function loginContext(browser: Browser, testInfo: TestInfo, role: RoleKey): Promise<BrowserContext> {
	const { login } = loginAccount(projectKey(testInfo), role)
	const use = testInfo.project.use
	const context = await browser.newContext({
		baseURL: baseUrlOf(testInfo),
		viewport: use.viewport ?? undefined,
		userAgent: use.userAgent,
		deviceScaleFactor: use.deviceScaleFactor,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
	})
	const response = await context.request.post('/api/auth/login', {
		data: { username: login, password: E2E_PASSWORD },
	})
	expect(response.status(), `login of ${login}`).toBe(200)
	return context
}

async function cookieNames(context: BrowserContext): Promise<string[]> {
	return (await context.cookies()).map((cookie) => cookie.name)
}

test.describe.serial('D8: server page refresh @session', () => {
	let context: BrowserContext | undefined

	test('D8 setup: admin logs in through the API @session @known-defect', async ({ browser }, testInfo) => {
		context = await loginContext(browser, testInfo, 'admin')
		const names = await cookieNames(context)
		expect(names).toContain(SESSION_COOKIE)
		expect(names).toContain(REFRESH_COOKIE)
	})

	test.afterAll(async () => {
		await context?.close()
	})

	test.fail(
		'D8 — fixed in Phase 4 (AUTH-11): a server page with an expired access token and a live refresh token opens without /login @session @known-defect',
		async () => {
			const testInfo = test.info()
			await context!.clearCookies({ name: SESSION_COOKIE })
			const page = await context!.newPage()
			const navigations: string[] = []
			page.on('framenavigated', (frame) => {
				if (frame === page.mainFrame()) navigations.push(frame.url())
			})
			const profilePath = `/profile/${sessionAccount(projectKey(testInfo), 'user').login}`
			await page.goto(profilePath)
			await page.waitForLoadState('networkidle')
			const finalPath = new URL(page.url()).pathname
			const loginNavigations = navigations.filter((url) => new URL(url).pathname === '/login')
			expect(
				{ navigations: loginNavigations, finalPath },
				`main frame navigations: ${navigations.join(' -> ')}`
			).toEqual({ navigations: [], finalPath: profilePath })
		}
	)
})

test.describe.serial('D3: one /api/auth/me per load @session', () => {
	let context: BrowserContext | undefined

	test('D3 setup: student logs in through the API @session @known-defect', async ({ browser }, testInfo) => {
		context = await loginContext(browser, testInfo, 'user')
		expect(await cookieNames(context)).toContain(SESSION_COOKIE)
	})

	test.afterAll(async () => {
		await context?.close()
	})

	test.fail(
		'D3 — fixed in Phase 4 (AUTH-10): a page load with a live session makes no browser /api/auth/me or /api/auth/refresh request @session @known-defect',
		async () => {
			const page = await context!.newPage()
			const counts = { me: 0, refresh: 0 }
			page.on('request', (request) => {
				const url = request.url()
				if (url.includes('/api/auth/me')) counts.me++
				if (url.includes('/api/auth/refresh')) counts.refresh++
			})
			await page.goto('/dashboard')
			await page.waitForLoadState('networkidle')
			expect(counts, 'browser /api/auth/me and /api/auth/refresh requests on /dashboard load').toEqual({
				me: 0,
				refresh: 0,
			})
		}
	)
})

test.describe.serial('AUTH-04: logout revokes the access token @session', () => {
	let context: BrowserContext | undefined
	let oldSession = ''

	test('AUTH-04 setup: student logs in and logs out @session', async ({ browser }, testInfo) => {
		context = await loginContext(browser, testInfo, 'user')
		const session = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
		expect(session?.value, SESSION_COOKIE).toBeTruthy()
		oldSession = session!.value
		const loggedOut = await context.request.post('/api/auth/logout')
		expect(loggedOut.status(), 'logout').toBe(200)
	})

	test.afterAll(async () => {
		await context?.close()
	})

	test('AUTH-04: after logout the old access cookie is rejected @session', async () => {
		await context!.addCookies([{ name: SESSION_COOKIE, value: oldSession, url: baseUrlOf(test.info()) }])
		const me = await context!.request.get('/api/auth/me')
		expect(me.status(), 'GET /api/auth/me with the access cookie from before logout').toBe(401)
	})
})

test('role user does not see the /admin/users section @session', async ({ studentPage: page }) => {
	await page.goto('/admin/users')
	await page.waitForLoadState('networkidle')
	expect(new URL(page.url()).pathname).toBe('/admin/users')
	await expect(page.getByRole('heading', { name: 'Пользователи' })).toHaveCount(0)
	await expect(page.locator('table')).toHaveCount(0)
})
