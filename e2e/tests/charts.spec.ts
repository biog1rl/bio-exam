import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const ACTIVITY_FIGURE = 'График активности учеников'

function savedCharts(page: Page) {
	return page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/settings/charts' && response.request().method() === 'PUT'
	)
}

async function openActivitySettings(page: Page) {
	await page.goto('/admin/settings/chart?chart=activity')
	await expect(page.getByRole('heading', { level: 1, name: 'Графики' })).toBeVisible()
	await expect(page.getByRole('heading', { level: 2, name: 'Активность учеников' })).toBeVisible()
	await expect(page.getByRole('figure', { name: ACTIVITY_FIGURE })).toBeVisible()
}

test('the activity chart type changes in the preview, persists after a reload and resets to the default @charts', async ({
	adminPage: page,
}) => {
	await openActivitySettings(page)
	expect(await lowContrastTexts(page), 'contrast on the charts page').toEqual([])
	expect(await horizontalOverflow(page), 'overflow on the charts page').toEqual([])

	const save = page.getByRole('button', { name: 'Сохранить', exact: true })
	await expect(save).toBeDisabled()
	await page.getByRole('radio', { name: 'Линия' }).click()
	await expect(page.getByRole('figure', { name: ACTIVITY_FIGURE }).locator('.recharts-line')).toHaveCount(1)
	await expect(save).toBeEnabled()
	const saved = savedCharts(page)
	await save.click()
	expect((await saved).ok(), 'chart settings saved').toBe(true)
	await expect(save).toBeDisabled()

	await openActivitySettings(page)
	await expect(page.getByRole('radio', { name: 'Линия' })).toHaveAttribute('aria-checked', 'true')

	await page.getByRole('button', { name: 'Стандартные настройки' }).click()
	await expect(page.getByRole('radio', { name: 'Столбцы' })).toHaveAttribute('aria-checked', 'true')
	const reset = savedCharts(page)
	await save.click()
	expect((await reset).ok(), 'defaults saved').toBe(true)
	await expect(page.getByRole('button', { name: 'Стандартные настройки' })).toBeDisabled()
})

test('the staff dashboard shows the content and activity charts @charts', async ({ adminPage: page }) => {
	await page.goto('/dashboard')
	await expect(page.getByRole('heading', { level: 2, name: 'Публикации и наполнение' })).toBeVisible()
	await expect(page.getByRole('heading', { level: 2, name: 'Активность учеников' })).toBeVisible()
	await expect(page.getByRole('figure', { name: ACTIVITY_FIGURE })).toBeVisible()
	await expect(page.getByRole('figure', { name: 'График наполнения тем' })).toBeVisible()
})
