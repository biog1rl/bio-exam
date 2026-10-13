/**
 * D-14 flow 1: вход и выход студента и администратора, редирект с защищённой страницы на /login.
 * Оба проекта (chromium-desktop, chromium-mobile) работают со своими аккаунтами из seed.json.
 *
 * Явные тесты входа используют отдельные аккаунты login-student-<p> и login-admin-<p>: каждый
 * входит один раз за прогон без неверных паролей, троттлинг входа их не задевает. Сессионные
 * аккаунты (student-<p>) берут storageState, сохранённый в auth.setup.ts.
 *
 * Форма входа подписана только placeholder (без <label>), поэтому поля ищутся по placeholder.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
	E2E_PASSWORD,
	loginAccount,
	projectKeyFromName,
	sessionAccount,
	storageStatePath,
	type ProjectKey,
} from '../fixtures/accounts'
import { createOwnTest, currentUserId, deleteOwnTest, newSessionContext } from '../fixtures/exam'

const USER_KEY_PREFIXES = [
	'test-session-',
	'test-answers-wal-',
	'test-frozen-',
	'test-client-attempt-',
	'test-unsent-',
	'question-draft-wal-',
]
const SESSION_REFRESH_RECORD_KEY = 'bio-exam:session-refresh'
const ANSWER_PATCH = /\/api\/tests\/public\/tests\/[^/]+\/sessions\/[^/]+\/answers$/

async function localStorageKeys(page: Page): Promise<string[]> {
	return page.evaluate(() => Object.keys(window.localStorage).sort())
}

function userKeys(keys: string[], userId: string): string[] {
	return keys.filter((key) => USER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) && key.endsWith(`-${userId}`))
}

function projectKey(testInfo: TestInfo): ProjectKey {
	return projectKeyFromName(testInfo.project.name)
}

/** Тест с сохранённой сессией студента своего проекта */
const studentSession = test.extend({
	// oxlint-disable-next-line no-empty-pattern -- Playwright требует деструктуризацию первого аргумента фикстуры
	storageState: async ({}, use, testInfo) => {
		await use(storageStatePath(sessionAccount(projectKey(testInfo), 'user').login))
	},
})

async function logIn(page: Page, login: string): Promise<void> {
	await page.goto('/login')
	await page.getByPlaceholder('Login').fill(login)
	await page.getByPlaceholder('Пароль').fill(E2E_PASSWORD)
	let reenabledBeforeLeaving = false
	await page.exposeFunction('reportLoginSubmitReenabled', () => {
		reenabledBeforeLeaving = true
	})
	await page.evaluate(() => {
		const button = document.querySelector<HTMLButtonElement>('form button[type="submit"]')
		if (!button) throw new Error('login submit button not found')
		const report = (window as unknown as { reportLoginSubmitReenabled(): void }).reportLoginSubmitReenabled
		let wasDisabled = false
		new MutationObserver(() => {
			if (button.disabled) wasDisabled = true
			else if (wasDisabled) report()
		}).observe(button, { attributes: true, attributeFilter: ['disabled'] })
	})
	let releaseDashboard: () => void = () => {}
	const dashboardHeld = new Promise<void>((resolve) => {
		releaseDashboard = resolve
	})
	await page.route(/\/dashboard$/, async (route) => {
		if (route.request().isNavigationRequest()) await dashboardHeld
		await route.continue()
	})
	const loginResponse = page.waitForResponse(
		(response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
	)
	await page.getByRole('button', { name: 'Войти' }).click()
	expect((await loginResponse).status()).toBe(200)
	await new Promise((resolve) => setTimeout(resolve, 500))
	releaseDashboard()
	// После входа без callbackUrl приложение ведёт на /dashboard
	await expect(page).toHaveURL(/\/dashboard$/)
	await page.unroute(/\/dashboard$/)
	expect(reenabledBeforeLeaving).toBe(false)
}

/**
 * Кнопка меню пользователя в подвале сайдбара. На мобильной ширине сайдбар — закрытый Sheet,
 * его открывает кнопка «Открыть меню» в шапке.
 */
async function openUserMenu(page: Page, testInfo: TestInfo, login: string): Promise<void> {
	const menuButton = page.getByRole('button', { name: new RegExp(login) })
	if (projectKey(testInfo) === 'mobile') {
		await page.getByRole('button', { name: 'Открыть меню' }).click()
	}
	await expect(menuButton).toBeVisible()
	const logoutItem = page.getByRole('menuitem', { name: 'Выйти' })
	await expect(async () => {
		if ((await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click()
		await expect(logoutItem).toBeVisible({ timeout: 2_000 })
	}).toPass({ timeout: 20_000 })
}

async function logOut(page: Page, testInfo: TestInfo, login: string): Promise<void> {
	await openUserMenu(page, testInfo, login)
	await page.getByRole('menuitem', { name: 'Выйти' }).click()
	await expect(page.getByText('Вы вышли из аккаунта')).toHaveCount(1)
	await expect(page).toHaveURL(/\/login$/)
	await expect(page.getByPlaceholder('Login')).toBeVisible()
}

async function expectRedirectToLogin(page: Page): Promise<void> {
	await page.goto('/dashboard')
	await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard$/)
	await expect(page.getByPlaceholder('Login')).toBeVisible()
}

studentSession('student session opens the dashboard without a login form @smoke', async ({ page }) => {
	await page.goto('/dashboard')
	await expect(page).toHaveURL(/\/dashboard$/)
	await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
	await expect(page.getByPlaceholder('Пароль')).toHaveCount(0)
})

test.describe('flow 1: login, logout and protected-page redirect', () => {
	test('anonymous visit to a protected page redirects to /login @flow1', async ({ page }) => {
		await expectRedirectToLogin(page)
	})

	test('student logs in and logs out @flow1', async ({ page }, testInfo) => {
		const { login } = loginAccount(projectKey(testInfo), 'user')
		await logIn(page, login)
		await logOut(page, testInfo, login)
		await expectRedirectToLogin(page)
	})

	test('admin logs in, opens /admin and logs out @flow1', async ({ page }, testInfo) => {
		const { login } = loginAccount(projectKey(testInfo), 'admin')
		await logIn(page, login)

		await page.goto('/admin')
		await expect(page).toHaveURL(/\/admin$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Панель управления' })).toBeVisible()
		await expect(page.getByRole('link', { name: /Пользователи/ }).first()).toBeVisible()

		await logOut(page, testInfo, login)
		await expectRedirectToLogin(page)
	})

	test('logout from a test page removes the student draft keys from localStorage @flow1', async ({
		browser,
		page,
	}, testInfo) => {
		const { login } = loginAccount(projectKey(testInfo), 'user')
		await logIn(page, login)
		const userId = await currentUserId(page)
		const adminContext = await newSessionContext(browser, testInfo, 'admin')
		const admin = await adminContext.newPage()
		const own = await createOwnTest(admin, page, {
			prefix: `logout-clear-${projectKey(testInfo)}`,
			questions: [
				{ type: 'short_answer', prompt: 'Как называется деление с сохранением числа хромосом?', correct: 'митоз' },
			],
		})
		try {
			await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
			await expect(page.getByText('Отвечено: 0 / 1')).toBeVisible()
			const saved = page.waitForResponse(
				(response) => response.request().method() === 'PATCH' && ANSWER_PATCH.test(new URL(response.url()).pathname)
			)
			await page.getByPlaceholder('Введите ответ').fill('митоз')
			expect((await saved).status()).toBe(200)
			await expect
				.poll(async () => userKeys(await localStorageKeys(page), userId))
				.toContain(`test-answers-wal-${own.id}-${userId}`)

			const foreignKey = `test-answers-wal-${own.id}-${userId}0`
			await page.evaluate(
				({ seeded, foreign, refreshKey }) => {
					for (const key of seeded) window.localStorage.setItem(key, '{}')
					window.localStorage.setItem(foreign, '{}')
					window.localStorage.setItem(refreshKey, '{}')
				},
				{
					seeded: [
						`test-frozen-${own.id}-${userId}`,
						`test-client-attempt-${own.id}-${userId}`,
						`test-unsent-${own.id}-${userId}`,
						`question-draft-wal-e2e-${userId}`,
					],
					foreign: foreignKey,
					refreshKey: SESSION_REFRESH_RECORD_KEY,
				}
			)
			const before = await localStorageKeys(page)
			console.log(`localStorage before logout: ${before.join(', ')}`)

			await logOut(page, testInfo, login)
			const after = await localStorageKeys(page)
			console.log(`localStorage after logout: ${after.join(', ')}`)
			expect(userKeys(after, userId)).toEqual([])
			expect(after).not.toContain(SESSION_REFRESH_RECORD_KEY)
			expect(after).toContain(foreignKey)
		} finally {
			await deleteOwnTest(admin, own)
			await adminContext.close()
		}
	})
})
