import { expect, type Page } from '@playwright/test'

/**
 * Новый вопрос открывается как у пользователя: кнопка «Добавить вопрос» в редакторе теста
 * создаёт черновик и ведёт на его адрес. Возвращает id черновика.
 */
export async function openNewQuestionDraft(page: Page, testUrl: string): Promise<string> {
	await page.goto(testUrl)
	await page.getByRole('button', { name: 'Добавить вопрос', exact: true }).click()
	await expect(page).toHaveURL(new RegExp(`${testUrl}/questions/drafts/[0-9a-f-]+$`))
	await expect(page.getByRole('heading', { level: 1, name: 'Новый вопрос' })).toBeVisible()
	const draftId = /\/questions\/drafts\/([0-9a-f-]+)$/.exec(new URL(page.url()).pathname)?.[1]
	if (!draftId) throw new Error(`setup: no draft id in ${page.url()}`)
	return draftId
}
