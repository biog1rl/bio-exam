import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

type OpenedDraft = { url: string; draftId: string }

function testPageUrl(slug: string): string {
	return `/admin/tests/${TOPIC_SLUG}/${slug}`
}

function typeSelect(page: Page): Locator {
	return page.getByText('Тип вопроса', { exact: true }).locator('xpath=..').getByRole('combobox')
}

function promptEditor(page: Page): Locator {
	return page.getByRole('textbox').first()
}

async function openNewDraft(page: Page, slug: string): Promise<OpenedDraft> {
	await page.goto(`${testPageUrl(slug)}/questions/new`)
	await expect(page).toHaveURL(new RegExp(`${testPageUrl(slug)}/questions/drafts/[0-9a-f-]+$`))
	await expect(page.getByRole('heading', { level: 1, name: 'Новый вопрос' })).toBeVisible()
	await expect(typeSelect(page)).toBeEnabled()
	await expect(promptEditor(page)).toHaveAttribute('contenteditable', 'true')
	const url = page.url()
	const draftId = /\/questions\/drafts\/([0-9a-f-]+)$/.exec(new URL(url).pathname)?.[1]
	if (!draftId) throw new Error(`setup: no draft id in ${url}`)
	return { url, draftId }
}

async function testIdOf(page: Page, slug: string): Promise<string> {
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok(), `setup: read test ${slug}`).toBe(true)
	return ((await response.json()) as { test: { id: string } }).test.id
}

async function deleteDraft(page: Page, testId: string, draftId: string): Promise<void> {
	const response = await page.request.delete(`/api/tests/${testId}/question-drafts/${draftId}`)
	expect([200, 404], `cleanup: delete draft ${draftId}`).toContain(response.status())
}

test.describe.serial('LIFE-04: черновик вопроса переживает мгновенный уход', () => {
	test('подготовка LIFE-04: правка черновика доходит до сервера и видна после повторного открытия @life04', async ({
		adminPage: page,
	}, testInfo) => {
		const slug = seedTest(projectKey(testInfo), 'authoring').slug
		const prompt = `Черновик e2e подготовка ${projectKey(testInfo)}`
		const testId = await testIdOf(page, slug)
		const { url, draftId } = await openNewDraft(page, slug)
		try {
			const saved = page.waitForResponse(
				(response) =>
					response.request().method() === 'PATCH' &&
					response.url().includes(draftId) &&
					(response.request().postData() ?? '').includes(prompt) &&
					response.status() === 200
			)
			await promptEditor(page).click()
			await page.keyboard.type(prompt)
			await saved
			await page.goto(url)
			await expect(promptEditor(page)).toContainText(prompt)
		} finally {
			await deleteDraft(page, testId, draftId)
		}
	})

	test('LIFE-04 known defect (чинит 06-08): правка и сразу «Отмена» сохраняют последнюю правку @known-defect @life04', async ({
		adminPage: page,
	}, testInfo) => {
		test.fail()
		const slug = seedTest(projectKey(testInfo), 'authoring').slug
		const prompt = `Черновик e2e отмена ${projectKey(testInfo)}`
		const testId = await testIdOf(page, slug)
		const { url, draftId } = await openNewDraft(page, slug)
		try {
			await promptEditor(page).click()
			await page.keyboard.type(prompt)
			await page.getByRole('button', { name: 'Отмена', exact: true }).click()
			await expect(page).toHaveURL(new RegExp(`${testPageUrl(slug)}/?$`))
			await page.goto(url)
			await expect(promptEditor(page)).toContainText(prompt)
		} finally {
			await deleteDraft(page, testId, draftId)
		}
	})

	test('LIFE-04 known defect (чинит 06-08): перезагрузка во время задержанного PATCH сохраняет последнюю правку @known-defect @life04', async ({
		adminPage: page,
	}, testInfo) => {
		test.fail()
		const slug = seedTest(projectKey(testInfo), 'authoring').slug
		const prompt = `Черновик e2e перезагрузка ${projectKey(testInfo)}`
		const testId = await testIdOf(page, slug)
		const { draftId } = await openNewDraft(page, slug)
		try {
			await page.route('**/api/tests/*/question-drafts/*', async (route) => {
				if (route.request().method() === 'PATCH') {
					await new Promise((resolve) => setTimeout(resolve, 5000))
					await route.continue().catch(() => {})
					return
				}
				await route.continue().catch(() => {})
			})
			const patched = page.waitForRequest(
				(request) =>
					request.method() === 'PATCH' && request.url().includes(draftId) && (request.postData() ?? '').includes(prompt)
			)
			await promptEditor(page).click()
			await page.keyboard.type(prompt)
			await patched
			await page.reload()
			await page.unrouteAll({ behavior: 'ignoreErrors' })
			await expect(promptEditor(page)).toContainText(prompt)
		} finally {
			await page.unrouteAll({ behavior: 'ignoreErrors' })
			await deleteDraft(page, testId, draftId)
		}
	})
})

function unsavedDialog(page: Page): Locator {
	return page.getByRole('alertdialog')
}

async function openQuestionEdit(page: Page, url: string, prompt: string): Promise<void> {
	await page.goto(url)
	await expect(page.getByRole('heading', { level: 1, name: 'Редактирование' })).toBeVisible()
	await expect(promptEditor(page)).toHaveAttribute('contenteditable', 'true')
	await expect(promptEditor(page)).toContainText(prompt)
}

test('LIFE-04: правка существующего вопроса защищена от ухода @life04', async ({ adminPage: page }, testInfo) => {
	const slug = seedTest(projectKey(testInfo), 'authoring').slug
	const prompt = `Правка e2e ${projectKey(testInfo)}`
	const testId = await testIdOf(page, slug)
	const testPage = new RegExp(`${testPageUrl(slug)}/?$`)
	let questionId: string | undefined
	let draftId: string | undefined
	try {
		draftId = (await openNewDraft(page, slug)).draftId
		await promptEditor(page).click()
		await page.keyboard.type(prompt)
		await expect(promptEditor(page)).toContainText(prompt)
		await page.getByPlaceholder('Введите правильный ответ').fill('митоз')
		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
		await expect(page).toHaveURL(testPage)

		const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
		expect(response.ok(), 'setup: read questions').toBe(true)
		const { questions } = (await response.json()) as { questions: { id: string; promptText: string }[] }
		questionId = questions.find((question) => question.promptText.includes(prompt))?.id
		if (!questionId) throw new Error(`setup: no question "${prompt}"`)
		const editUrl = `${testPageUrl(slug)}/questions/${questionId}`

		await openQuestionEdit(page, editUrl, prompt)
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(page).toHaveURL(testPage)
		await expect(unsavedDialog(page)).toHaveCount(0)

		await openQuestionEdit(page, editUrl, prompt)
		await promptEditor(page).click()
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(page).toHaveURL(testPage)
		await expect(unsavedDialog(page)).toHaveCount(0)

		await openQuestionEdit(page, editUrl, prompt)
		await promptEditor(page).click()
		await page.keyboard.press('End')
		await page.keyboard.type(' дополнено')
		await expect(promptEditor(page)).toContainText(`${prompt} дополнено`)

		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(unsavedDialog(page)).toBeVisible()
		await expect(unsavedDialog(page).getByText('Есть несохранённые изменения')).toBeVisible()
		await expect(unsavedDialog(page).getByText('Уйти без сохранения?')).toBeVisible()
		await unsavedDialog(page).getByRole('button', { name: 'Остаться' }).click()
		await expect(unsavedDialog(page)).toHaveCount(0)
		await expect(page).toHaveURL(new RegExp(`${editUrl}$`))

		await page.getByRole('button', { name: 'Назад', exact: true }).click()
		await expect(unsavedDialog(page)).toBeVisible()
		await expect(unsavedDialog(page).getByText('Уйти без сохранения?')).toBeVisible()
		await unsavedDialog(page).getByRole('button', { name: 'Выйти' }).click()
		await expect(page).not.toHaveURL(new RegExp(`${editUrl}$`))
	} finally {
		if (draftId) await deleteDraft(page, testId, draftId)
		if (questionId) {
			const deleted = await page.request.delete(`/api/tests/${testId}/questions/${questionId}`)
			expect([200, 204, 404], `cleanup: delete question ${questionId}`).toContain(deleted.status())
		}
	}
})
