import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const PERMISSION = 'Учитель: Пользователи — Просмотр ролей'

async function openUsersDomain(page: Page) {
	await page.goto('/admin/settings/rbac')
	await expect(page.getByRole('heading', { level: 1, name: 'Права доступа' })).toBeVisible()
	await page.getByRole('button', { name: /^Пользователи/ }).click()
	await expect(page.getByRole('checkbox', { name: PERMISSION })).toBeVisible()
}

function grantResponse(page: Page, method: 'POST' | 'DELETE') {
	return page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/rbac/grant' && response.request().method() === method
	)
}

test('a teacher permission toggled on the roles page persists after a reload and goes back to the default @rbac', async ({
	adminPage: page,
}) => {
	await openUsersDomain(page)
	expect(await lowContrastTexts(page), 'contrast with a domain open').toEqual([])
	expect(await horizontalOverflow(page), 'overflow with a domain open').toEqual([])

	const checkbox = page.getByRole('checkbox', { name: PERMISSION })
	await expect(checkbox).not.toBeChecked()
	const granted = grantResponse(page, 'POST')
	await checkbox.click()
	expect((await granted).ok(), 'grant saved').toBe(true)
	await expect(checkbox).toBeChecked()

	await openUsersDomain(page)
	await expect(checkbox).toBeChecked()

	const reset = grantResponse(page, 'DELETE')
	await checkbox.click()
	expect((await reset).ok(), 'override removed').toBe(true)
	await expect(checkbox).not.toBeChecked()
})
