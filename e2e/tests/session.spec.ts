import { type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

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

	test('D8 setup: admin logs in through the API @session', async ({ browser }, testInfo) => {
		context = await loginContext(browser, testInfo, 'admin')
		const names = await cookieNames(context)
		expect(names).toContain(SESSION_COOKIE)
		expect(names).toContain(REFRESH_COOKIE)
	})

	test.afterAll(async () => {
		await context?.close()
	})

	test('D8: a server page with an expired access token and a live refresh token opens without /login @session', async () => {
		const testInfo = test.info()
		await context!.clearCookies({ name: SESSION_COOKIE })
		const refreshBefore = (await context!.cookies()).find((cookie) => cookie.name === REFRESH_COOKIE)?.value
		expect(refreshBefore, REFRESH_COOKIE).toBeTruthy()
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
		await testInfo.attach('D8 main frame navigations', { body: navigations.join('\n'), contentType: 'text/plain' })
		expect({ navigations: loginNavigations, finalPath }, `main frame navigations: ${navigations.join(' -> ')}`).toEqual(
			{ navigations: [], finalPath: profilePath }
		)
		expect(await cookieNames(context!), 'the access cookie set by the proxy refresh reaches the browser').toContain(
			SESSION_COOKIE
		)
		const refreshAfter = (await context!.cookies()).find((cookie) => cookie.name === REFRESH_COOKIE)?.value
		expect(refreshAfter, 'the rotated refresh cookie set by the proxy reaches the browser').toBeTruthy()
		expect(refreshAfter).not.toBe(refreshBefore)
	})
})

test.describe.serial('D3: one /api/auth/me per load @session', () => {
	let context: BrowserContext | undefined

	test('D3 setup: student logs in through the API @session', async ({ browser }, testInfo) => {
		context = await loginContext(browser, testInfo, 'user')
		expect(await cookieNames(context)).toContain(SESSION_COOKIE)
	})

	test.afterAll(async () => {
		await context?.close()
	})

	test('D3: a page load with a live session makes no browser /api/auth/me or /api/auth/refresh request @session', async () => {
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
	})
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
	await expect(page.getByRole('heading', { name: 'Нет доступа к разделу' })).toBeVisible()
	await expect(page.locator('main').getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/dashboard')
	expect(await page.locator('header').count()).toBeGreaterThanOrEqual(1)
	await expect(page.getByRole('heading', { name: 'Пользователи' })).toHaveCount(0)
	await expect(page.locator('table')).toHaveCount(0)
})

test('login page shows the 429 wait and re-enables on login change @session', async ({ page }, testInfo) => {
	const ghost = `ghost-${projectKey(testInfo)}-${Math.random().toString(36).slice(2, 10)}`
	await page.goto('/login')
	const statuses = await page.evaluate(async (username) => {
		const result: number[] = []
		for (let attempt = 0; attempt < 6; attempt++) {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username, password: 'wrong-password-1' }),
			})
			result.push(response.status)
		}
		return result
	}, ghost)
	expect(statuses, `failed logins of ${ghost}`).toEqual([401, 401, 401, 401, 401, 401])

	await page.getByPlaceholder('Login').fill(ghost)
	await page.getByPlaceholder('Пароль').fill('wrong-password-1')
	const submit = page.getByRole('button', { name: 'Войти' })
	await submit.click()

	const waitLine = page.getByText(/^Слишком много неудачных попыток входа\. Попробуйте через /).first()
	await expect(waitLine).toBeVisible()
	await expect(submit).toBeDisabled()

	await page.getByPlaceholder('Пароль').fill('another-password-1')
	await expect(waitLine).toBeVisible()
	await expect(submit).toBeDisabled()

	await page.getByPlaceholder('Login').fill(`${ghost}-x`)
	await expect(page.getByText(/Слишком много неудачных попыток входа/)).toHaveCount(0)
	await expect(submit).toBeEnabled()
})

async function openUserCard(page: Page, login: string): Promise<void> {
	await page.getByRole('searchbox', { name: 'Поиск пользователей' }).fill(login)
	await page.getByRole('button', { name: `Действия с пользователем ${login}`, exact: true }).click()
	await page.getByRole('menuitem', { name: 'Изменить профиль' }).click()
	await expect(page.getByRole('heading', { name: `Редактировать пользователя: ${login}` })).toBeVisible()
}

test('admin sees session actions in the user card @session', async ({ adminPage: page }, testInfo) => {
	const key = projectKey(testInfo)
	const student = loginAccount(key, 'user').login
	const self = sessionAccount(key, 'admin').login
	const revokeRequests: string[] = []
	const clearRequests: string[] = []
	page.on('request', (request) => {
		if (request.url().includes('/sessions/revoke')) revokeRequests.push(request.url())
		if (request.url().includes('/login-throttle')) clearRequests.push(request.method())
	})

	await page.goto('/admin/users')
	await openUserCard(page, student)

	await expect(page.getByText('Сеансы и вход', { exact: true })).toBeVisible()
	const revokeButton = page.getByRole('button', { name: 'Завершить все сеансы', exact: true })
	const clearButton = page.getByRole('button', { name: 'Снять ограничение входа', exact: true })
	await expect(revokeButton).toBeEnabled()
	await expect(clearButton).toBeEnabled()

	await clearButton.click()
	const clearConfirm = page.getByRole('alertdialog')
	await expect(clearConfirm.getByRole('heading', { name: 'Снять ограничение входа?' })).toBeVisible()
	await clearConfirm.getByRole('button', { name: 'Снять ограничение', exact: true }).click()
	await expect(page.getByText(`Ограничение входа для «${student}» снято`).first()).toBeVisible()
	expect(clearRequests, 'requests to /login-throttle').toEqual(['DELETE'])
	await expect(page.getByRole('alertdialog')).toHaveCount(0)
	await expect(page.getByRole('heading', { name: `Редактировать пользователя: ${student}` })).toBeVisible()

	await revokeButton.click()
	const revokeConfirm = page.getByRole('alertdialog')
	await expect(revokeConfirm.getByRole('heading', { name: 'Завершить все сеансы пользователя?' })).toBeVisible()
	await expect(revokeConfirm.getByText(`«${student}»`)).toBeVisible()
	await revokeConfirm.getByRole('button', { name: 'Отмена', exact: true }).click()
	await expect(page.getByRole('alertdialog')).toHaveCount(0)
	await expect(page.getByRole('heading', { name: `Редактировать пользователя: ${student}` })).toBeVisible()
	expect(revokeRequests, 'requests to /sessions/revoke after cancel').toEqual([])

	await page.keyboard.press('Escape')
	await expect(page.getByRole('heading', { name: `Редактировать пользователя: ${student}` })).toHaveCount(0)

	await openUserCard(page, self)
	await expect(page.getByRole('button', { name: 'Завершить все сеансы', exact: true })).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Снять ограничение входа', exact: true })).toBeEnabled()
})
