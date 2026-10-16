import { createOwnTest, deleteOwnTest, expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

test('DEBT-02: страница 404 под сессией загружает картинку not-found.svg', async ({ studentPage: page }) => {
	const response = await page.goto('/no-such-page-e2e')
	expect(response?.status()).toBe(404)
	const image = page.locator('img[src$="/img/not-found.svg"]')
	await expect(image).toBeVisible()
	await expect
		.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
		.toBe(true)
})

test('D-21: в защищённой области один Toaster и сообщение показывается один раз', async ({
	adminPage: page,
	studentPage,
}, testInfo) => {
	const own = await createOwnTest(page, studentPage, {
		prefix: `toaster-${projectKey(testInfo)}`,
		questions: [
			{
				prompt: `Тост e2e ${projectKey(testInfo)}`,
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
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${own.slug}/questions/${questionRow.id}`)
		await expect(page.getByRole('heading', { level: 1, name: /^Вопрос \d+$/ })).toBeVisible()

		await page.getByRole('button', { name: 'Добавить', exact: true }).click()
		await expect(page.getByPlaceholder('Вариант 3')).toHaveValue('')
		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()

		const message = page.locator('[data-sonner-toast]', { hasText: 'Заполните все варианты ответа' })
		await expect(message).toHaveCount(1)
		await expect(page.locator('[data-sonner-toaster]')).toHaveCount(1)
	} finally {
		await deleteOwnTest(page, own)
	}
})
