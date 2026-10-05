import { expect, test } from '@playwright/test'

import { loginAccount, projectKeyFromName } from '../fixtures/accounts'

test('HTTP-02: неверный пароль оставляет на /login с понятным текстом @http02', async ({ page }, testInfo) => {
	const account = loginAccount(projectKeyFromName(testInfo.project.name), 'user')
	await page.goto('/login')
	await page.getByPlaceholder('Login').fill(account.login)
	await page.getByPlaceholder('Пароль').fill('wrong-password-e2e')
	const navigations: string[] = []
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) navigations.push(frame.url())
	})
	const response = page.waitForResponse(
		(item) => item.url().endsWith('/api/auth/login') && item.request().method() === 'POST'
	)
	await page.getByRole('button', { name: 'Войти' }).click()
	expect((await response).status()).toBe(401)

	await expect(page.getByText('Неверный логин или пароль', { exact: true })).toBeVisible()
	await expect(page).toHaveURL(/\/login$/)
	expect(navigations, 'no navigation after the 401').toEqual([])
	await expect(page.getByPlaceholder('Login')).toHaveValue(account.login)
	await expect(page.getByRole('button', { name: 'Войти' })).toBeEnabled()
	const me = await page.request.get('/api/auth/me')
	expect(me.status()).toBe(401)
})
