import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test } from '../fixtures/exam'

const DRAFT_PATCH = /\/api\/tests\/[^/]+\/question-drafts\/[^/]+$/

function promptEditor(page: Page): Locator {
	return page.getByRole('textbox').first()
}

type TeacherDraft = { testId: string; draftId: string; url: string; listUrl: string }

async function openTeacherDraft(page: Page, topic: string, slug: string): Promise<TeacherDraft> {
	const response = await page.request.get(`/api/tests/by-slug/${topic}/${slug}`)
	expect(response.ok(), `setup: read test ${slug}`).toBe(true)
	const testId = ((await response.json()) as { test: { id: string } }).test.id
	const listUrl = `/admin/tests/${topic}/${slug}`
	await page.goto(`${listUrl}/questions/new`)
	await expect(page).toHaveURL(new RegExp(`${listUrl}/questions/drafts/[0-9a-f-]+$`))
	await expect(page.getByRole('heading', { level: 1, name: 'Новый вопрос' })).toBeVisible()
	await expect(promptEditor(page)).toHaveAttribute('contenteditable', 'true')
	const draftId = /\/questions\/drafts\/([0-9a-f-]+)$/.exec(new URL(page.url()).pathname)?.[1]
	if (!draftId) throw new Error('setup: no draft id')
	return { testId, draftId, url: page.url(), listUrl }
}

async function deleteDraft(page: Page, draft: TeacherDraft): Promise<void> {
	const response = await page.context().request.delete(`/api/tests/${draft.testId}/question-drafts/${draft.draftId}`)
	expect([200, 404], `cleanup: delete draft ${draft.draftId}`).toContain(response.status())
}

test('LIFE-04: учитель без сети нажимает «Отмена» и видит диалог о несохранённых правках @life04', async ({
	teacherPage: page,
}, testInfo) => {
	const own = seedTest(projectKey(testInfo), 'teacher-test')
	const draft = await openTeacherDraft(page, own.topic!, own.slug)
	const prompt = `Черновик учителя офлайн ${projectKey(testInfo)}`
	try {
		const saved = page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' &&
				response.url().includes(draft.draftId) &&
				(response.request().postData() ?? '').includes(prompt) &&
				response.status() === 200
		)
		await promptEditor(page).click()
		await page.keyboard.type(prompt)
		await saved
		await expect(page.getByText('Сохранено', { exact: true })).toBeVisible()

		await page.context().setOffline(true)
		await page.keyboard.type(' без сети')
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		const dialog = page.getByRole('alertdialog')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('Есть несохранённые изменения')).toBeVisible()
		await expect(dialog).toContainText('Последние правки не дошли до сервера')
		await expect(page).toHaveURL(draft.url)
		await dialog.getByRole('button', { name: 'Остаться' }).click()
		await expect(dialog).toHaveCount(0)
		await expect(promptEditor(page)).toContainText(`${prompt} без сети`)

		await page.context().setOffline(false)
		await page.getByRole('button', { name: 'Отмена', exact: true }).click()
		await expect(page).toHaveURL(new RegExp(`${draft.listUrl}/?$`))
		const stored = await page.request.get(`/api/tests/${draft.testId}/question-drafts/${draft.draftId}`)
		expect(stored.ok()).toBe(true)
		expect(JSON.stringify(((await stored.json()) as { draft: { payload: unknown } }).draft.payload)).toContain(
			`${prompt} без сети`
		)
	} finally {
		await page.context().setOffline(false)
		await deleteDraft(page, draft)
	}
})

test('LIFE-04: закрытие вкладки учителя во время «Сохранение…» спрашивает подтверждение, после «Сохранено» нет @life04', async ({
	teacherPage: page,
}, testInfo) => {
	const own = seedTest(projectKey(testInfo), 'teacher-test')
	const draft = await openTeacherDraft(page, own.topic!, own.slug)
	const prompt = `Черновик учителя закрытие ${projectKey(testInfo)}`
	try {
		let release: () => void = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		await page.route(DRAFT_PATCH, async (route) => {
			if (route.request().method() === 'PATCH') await gate
			await route.continue().catch(() => {})
		})
		await promptEditor(page).click()
		await page.keyboard.type(prompt)
		await expect(page.getByText('Сохранение…', { exact: true })).toBeVisible()

		const prompted = page.waitForEvent('dialog')
		await page.close({ runBeforeUnload: true })
		const dialog = await prompted
		expect(dialog.type()).toBe('beforeunload')
		await dialog.dismiss()
		expect(page.isClosed()).toBe(false)

		release()
		await page.unrouteAll({ behavior: 'ignoreErrors' })
		await expect(page.getByText('Сохранено', { exact: true })).toBeVisible()

		let askedAgain = false
		page.on('dialog', async (next) => {
			askedAgain = true
			await next.accept()
		})
		const closed = page.waitForEvent('close')
		await page.close({ runBeforeUnload: true })
		await closed
		expect(askedAgain, 'no beforeunload prompt after the draft is saved').toBe(false)
	} finally {
		await deleteDraft(page, draft)
	}
})
