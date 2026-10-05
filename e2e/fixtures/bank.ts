import type { Page } from '@playwright/test'

/**
 * Названия тем в банке заданий: на широком экране — ссылки боковой колонки «Темы банка»,
 * на телефоне — пункты выпадающего списка «Тема» (вместе со строкой «Все тесты»).
 */
export async function bankTopicTitles(page: Page): Promise<string[]> {
	const nav = page.getByRole('navigation', { name: 'Темы банка' })
	if (await nav.isVisible()) {
		const names = await nav.getByRole('link').allInnerTexts()
		return names.map((name) => name.split('\n')[0].trim())
	}
	await page.getByRole('combobox', { name: 'Тема' }).click()
	const options = await page.getByRole('option').allInnerTexts()
	await page.keyboard.press('Escape')
	return options.map((option) => option.replace(/ · \d+$/, '').trim())
}

/** Перейти в тему банка через боковую колонку или список «Тема» на телефоне */
export async function openBankTopic(page: Page, title: string): Promise<void> {
	const nav = page.getByRole('navigation', { name: 'Темы банка' })
	if (await nav.isVisible()) {
		await nav.getByRole('link', { name: new RegExp(`^${escapeRegExp(title)}(\\s|$)`) }).click()
		return
	}
	await page.getByRole('combobox', { name: 'Тема' }).click()
	await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(title)} · \\d+$`) }).click()
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
