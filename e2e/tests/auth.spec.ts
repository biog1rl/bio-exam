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
	await page.getByRole('button', { name: 'Войти' }).click()
	// После входа без callbackUrl приложение ведёт на /dashboard
	await expect(page).toHaveURL(/\/dashboard$/)
}

/**
 * Кнопка меню пользователя в подвале сайдбара. На мобильной ширине сайдбар — закрытый Sheet,
 * а видимой кнопки его открытия в шапке нет; открываем его штатной горячей клавишей Ctrl+B.
 */
async function openUserMenu(page: Page, testInfo: TestInfo, login: string): Promise<void> {
	const menuButton = page.getByRole('button', { name: new RegExp(login) })
	if (projectKey(testInfo) === 'mobile') {
		testInfo.annotations.push({
			type: 'issue',
			description: 'mobile layout renders no visible sidebar trigger; the user menu is reached with Ctrl+B',
		})
		await expect(async () => {
			if (!(await menuButton.isVisible())) await page.keyboard.press('Control+b')
			await expect(menuButton).toBeVisible({ timeout: 2_000 })
		}).toPass({ timeout: 20_000 })
	}
	await expect(menuButton).toBeVisible()
	await menuButton.click()
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
		await expect(page.getByText('admin console')).toBeVisible()
		await expect(page.getByRole('link', { name: /Пользователи/ }).first()).toBeVisible()

		await logOut(page, testInfo, login)
		await expectRedirectToLogin(page)
	})
})
