import { type Request } from '@playwright/test'

import { createOwnTest, deleteOwnTest, expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

function isQuestionSave(request: Request): boolean {
	const path = new URL(request.url()).pathname
	if (path.includes('question-drafts')) return false
	return ['POST', 'PATCH', 'PUT'].includes(request.method()) && /^\/api\/tests\/[^/]+\/questions(\/[^/]+)?$/.test(path)
}

test('ошибка валидации в редакторе вопроса: один toast.error, запрос сохранения не уходит, форма не сбрасывается @authoring', async ({
	adminPage: page,
	studentPage,
}, testInfo) => {
	const prompt = `Валидация e2e ${projectKey(testInfo)}`
	const own = await createOwnTest(page, studentPage, {
		prefix: `validation-${projectKey(testInfo)}`,
		questions: [
			{
				prompt,
				options: [
					{ id: '1', text: 'Ядро' },
					{ id: '2', text: 'Рибосома' },
				],
				correct: '2',
			},
		],
	})
	try {
		const stored = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${own.slug}`)
		const [questionRow] = ((await stored.json()) as { questions: { id: string }[] }).questions
		const editUrl = `/admin/tests/${TOPIC_SLUG}/${own.slug}/questions/${questionRow.id}`
		await page.goto(editUrl)
		await expect(page.getByRole('heading', { level: 1, name: 'Редактирование' })).toBeVisible()
		await expect(page.getByRole('textbox').first()).toContainText(prompt)

		const saves: string[] = []
		page.on('request', (request) => {
			if (isQuestionSave(request)) saves.push(`${request.method()} ${request.url()}`)
		})

		await page.getByRole('button', { name: 'Добавить', exact: true }).click()
		await expect(page.getByPlaceholder('Вариант 3')).toHaveValue('')
		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()

		const errors = page.locator('[data-sonner-toast][data-type="error"]')
		await expect(errors).toHaveCount(1)
		await expect(errors).toContainText('Заполните все варианты ответа')
		await expect(page).toHaveURL(new RegExp(`${editUrl}$`))
		expect(saves, 'no save request after a validation error').toEqual([])

		await expect(page.getByRole('textbox').first()).toContainText(prompt)
		await expect(page.getByPlaceholder('Вариант 1')).toHaveValue('Ядро')
		await expect(page.getByPlaceholder('Вариант 2')).toHaveValue('Рибосома')
		await expect(page.getByPlaceholder('Вариант 3')).toHaveValue('')
		await expect(page.locator('[role="radio"][id="2"]')).toBeChecked()
		await expect(page.locator('[role="radio"][id="1"]')).not.toBeChecked()

		await page.getByPlaceholder('Вариант 3').fill('Лизосома')
		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}/${own.slug}/?$`))
		expect(saves, 'the valid form is saved with one request').toHaveLength(1)
		await expect(errors).toHaveCount(0)
	} finally {
		await deleteOwnTest(page, own)
	}
})
