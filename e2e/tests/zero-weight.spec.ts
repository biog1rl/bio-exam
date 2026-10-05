import {
	adminReviewSections,
	createOwnTest,
	deleteOwnTest,
	expect,
	isSubmitRequest,
	projectKey,
	test,
	type OwnQuestion,
	type SubmitPayload,
} from '../fixtures/exam'

const QUESTIONS: OwnQuestion[] = [
	{
		prompt: 'Вопрос без веса: какой органоид содержит хлорофилл?',
		options: [
			{ id: '1', text: 'Хлоропласт' },
			{ id: '2', text: 'Митохондрия' },
		],
		correct: '1',
	},
	{ type: 'short_answer', prompt: 'Как называется деление с сохранением числа хромосом?', correct: 'митоз' },
]

test('SCORE-04: вопрос веса 0 показан «Без оценки» в карточке ученика и в разборе администратора @score04', async ({
	adminPage,
	studentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, { prefix: `zero-${projectKey(testInfo)}`, questions: QUESTIONS })
	try {
		const override = await adminPage.request.put(`/api/tests/question-types/tests/${own.id}/overrides/radio`, {
			data: { scoringRuleOverride: { formula: 'exact_match', mistakeMetric: 'boolean_correct', correctPoints: 0 } },
		})
		expect(override.ok(), `setup: radio weight 0: ${await override.text()}`).toBe(true)
		const stored = await adminPage.request.get(`/api/tests/${own.id}`)
		expect(stored.ok()).toBe(true)
		const points = ((await stored.json()) as { questions: { order: number; points: number }[] }).questions
			.sort((a, b) => a.order - b.order)
			.map((question) => question.points)
		expect(points).toEqual([0, 1])

		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		await expect(page.getByText('Отвечено: 0 / 2')).toBeVisible()
		await page.getByRole('radio', { name: 'Хлоропласт', exact: true }).click()
		await page.getByRole('button', { name: 'Далее' }).click()
		await page.getByPlaceholder('Введите ответ').fill('митоз')
		await expect(page.getByText('Отвечено: 2 / 2')).toBeVisible()
		const submitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.getByRole('button', { name: 'Завершить' }).first().click()
		const response = await submitted
		expect(response.ok()).toBe(true)
		const payload = (await response.json()) as SubmitPayload
		expect(payload.results.map((row) => row.status)).toEqual(['ungraded', 'correct'])
		expect(payload.totalPoints).toBe(1)

		const section = page.locator('section[id^="question-"]')
		await page.getByRole('button', { name: '1', exact: true }).click()
		await expect(section.getByText('Без оценки', { exact: true }).first()).toBeVisible()
		await expect(section.getByText('Верно', { exact: true })).toHaveCount(0)
		await page.getByRole('button', { name: '2', exact: true }).click()
		await expect(section.getByText('Верно', { exact: true }).first()).toBeVisible()

		await adminReviewSections(adminPage, payload.attemptId, 2)
		await expect(adminPage.locator('#question-0').getByText('Без оценки', { exact: true })).toBeVisible()
		await expect(adminPage.locator('#question-0').getByText('Верно', { exact: true })).toHaveCount(0)
		await expect(adminPage.locator('#question-1').getByText('Верно', { exact: true })).toBeVisible()
	} finally {
		await deleteOwnTest(adminPage, own)
	}
})
