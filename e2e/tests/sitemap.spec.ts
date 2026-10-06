import type { Page, TestInfo } from '@playwright/test'

import { sessionAccount } from '../fixtures/accounts'
import { expect, projectKey, test } from '../fixtures/exam'

async function openUserMenu(page: Page, testInfo: TestInfo): Promise<void> {
	const { login } = sessionAccount(projectKey(testInfo), 'user')
	const menuButton = page.getByRole('button', { name: new RegExp(login) })
	if (projectKey(testInfo) === 'mobile') {
		await page.getByRole('button', { name: 'Открыть меню' }).click()
	}
	await expect(menuButton).toBeVisible()
	const siteMapItem = page.getByRole('menuitem', { name: 'Карта сайта' })
	await expect(async () => {
		if (!(await siteMapItem.isVisible())) await menuButton.click()
		await expect(siteMapItem).toBeVisible({ timeout: 2_000 })
	}).toPass({ timeout: 20_000 })
}

test.describe('site map', () => {
	test('student reaches the site map from the user menu and sees only the main pages', async ({
		studentPage: page,
	}, testInfo) => {
		await page.goto('/dashboard')
		await openUserMenu(page, testInfo)
		await page.getByRole('menuitem', { name: 'Карта сайта' }).click()
		await expect(page).toHaveURL(/\/sitemap$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Карта сайта' })).toBeVisible()
		await expect(page.getByRole('heading', { level: 2, name: 'Основное' })).toBeVisible()
		await expect(page.locator('main').getByRole('link', { name: /Тесты для прохождения/ })).toHaveAttribute(
			'href',
			'/tests'
		)
		await expect(page.getByRole('heading', { level: 2, name: 'Личное' })).toBeVisible()
		await expect(page.getByRole('heading', { level: 2, name: 'Управление' })).toHaveCount(0)
		await expect(page.getByRole('link', { name: /^Графики/ })).toHaveCount(0)
	})

	test('admin sees every section and opens the chart settings', async ({ adminPage: page }) => {
		await page.goto('/sitemap')
		for (const title of ['Основное', 'Управление', 'Настройки теста', 'Настройки общие', 'Личное']) {
			await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible()
		}
		await page.getByRole('searchbox', { name: 'Поиск разделов' }).fill('графики')
		await expect(page.getByRole('heading', { level: 2, name: 'Управление', exact: true })).toHaveCount(0)
		await expect(page.getByRole('heading', { level: 2, name: 'Настройки общие', exact: true })).toBeVisible()
		await page
			.locator('main')
			.getByRole('link', { name: /^Графики/ })
			.click()
		await expect(page).toHaveURL(/\/admin\/settings\/chart$/)
	})
})
