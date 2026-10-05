import type { Page, TestInfo } from '@playwright/test'

import { sessionAccount } from '../fixtures/accounts'
import { expect, projectKey, test } from '../fixtures/exam'

async function openUserMenu(page: Page, testInfo: TestInfo): Promise<void> {
	const { login } = sessionAccount(projectKey(testInfo), 'user')
	const menuButton = page.getByRole('button', { name: new RegExp(login) })
	if (projectKey(testInfo) === 'mobile') {
		await expect(async () => {
			if (!(await menuButton.isVisible())) await page.keyboard.press('Control+b')
			await expect(menuButton).toBeVisible({ timeout: 2_000 })
		}).toPass({ timeout: 20_000 })
	}
	await expect(menuButton).toBeVisible()
	await menuButton.click()
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
		await expect(page.locator('main').getByRole('link', { name: /Доступные тесты/ })).toHaveAttribute('href', '/tests')
		await expect(page.getByRole('heading', { level: 2, name: 'Администрирование' })).toHaveCount(0)
		await expect(page.getByRole('link', { name: /Диапазон графика/ })).toHaveCount(0)
	})

	test('admin sees every section and opens the chart range settings', async ({ adminPage: page }) => {
		await page.goto('/sitemap')
		for (const title of ['Основное', 'Администрирование', 'Банк заданий', 'Настройки']) {
			await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
		}
		await page.getByRole('link', { name: /Диапазон графика/ }).click()
		await expect(page).toHaveURL(/\/admin\/settings\/chart$/)
	})
})
