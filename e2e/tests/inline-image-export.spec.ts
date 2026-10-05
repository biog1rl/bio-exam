import fs from 'node:fs/promises'

import { createOwnTest, deleteOwnTest, expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

const PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4IWeDFTEMpAQACeY2YQMxYLIAAAAASUVORK5CYII='

test('вставленная base64-картинка сохраняется как images/<hash>.webp, ученик её видит, экспорт темы скачивает ZIP @assets', async ({
	adminPage: page,
	studentPage: student,
}, testInfo) => {
	const prompt = `Вставка картинки ${projectKey(testInfo)}`
	const own = await createOwnTest(page, student, {
		prefix: `inline-${projectKey(testInfo)}`,
		questions: [
			{
				prompt,
				options: [
					{ id: '1', text: 'Клетка' },
					{ id: '2', text: 'Ткань' },
				],
				correct: '1',
			},
		],
	})
	try {
		const before = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${own.slug}`)
		const [questionRow] = ((await before.json()) as { questions: { id: string }[] }).questions
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${own.slug}/questions/${questionRow.id}`)
		const editor = page.getByRole('textbox').first()
		await expect(editor).toHaveAttribute('contenteditable', 'true')
		await expect(editor).toContainText(prompt)
		await editor.click()
		await page.keyboard.press('End')

		await editor.evaluate((element, base64) => {
			const data = new DataTransfer()
			data.setData('text/html', `<p><img src="data:image/png;base64,${base64}" alt="вставка"></p>`)
			data.setData('text/plain', '')
			element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
		}, PNG_BASE64)
		await expect(editor.locator('img[src^="data:image/png;base64,"]')).toHaveCount(1)

		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}/${own.slug}/?$`))

		const after = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${own.slug}`)
		const [saved] = ((await after.json()) as { questions: { promptText: string }[] }).questions
		expect(saved.promptText).not.toContain('data:image')
		const stored = /images\/([0-9a-f]+\.webp)/.exec(saved.promptText)
		expect(stored, `stored prompt links a webp image: ${saved.promptText}`).not.toBeNull()
		const filename = stored![1]

		await student.goto(`/tests/${TOPIC_SLUG}/${own.slug}/start`)
		await expect(student.getByText('Отвечено: 0 / 1')).toBeVisible()
		const image = student.locator(`img[src*="${encodeURIComponent(filename)}"]`)
		await expect(image).toHaveCount(1)
		await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
		await student.getByRole('radio', { name: 'Клетка', exact: true }).click()
		await student.getByRole('button', { name: 'Завершить' }).first().click()
		await expect(student.getByRole('heading', { name: 'Результат' })).toBeVisible()

		await page.goto(`/admin/tests/${TOPIC_SLUG}`)
		await page.getByRole('button', { name: 'Экспорт', exact: true }).first().click()
		const download = page.waitForEvent('download')
		await page.getByRole('menuitem', { name: 'Без ответов' }).click()
		const archive = await download
		expect(archive.suggestedFilename()).toBe(`${TOPIC_SLUG}.zip`)
		const bytes = await fs.readFile(await archive.path())
		expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
		expect(bytes.includes(Buffer.from(filename)), `archive lists ${filename}`).toBe(true)
		expect(bytes.includes(Buffer.from(own.slug)), `archive lists ${own.slug}`).toBe(true)
	} finally {
		await deleteOwnTest(page, own)
	}
})
