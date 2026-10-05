import {
	attemptIdsOf,
	closeOpenSession,
	createOwnTest,
	deleteOwnTest,
	expect,
	isSubmitRequest,
	projectKey,
	test,
	type OwnQuestion,
} from '../fixtures/exam'

const QUESTIONS: OwnQuestion[] = [
	{
		prompt: 'Какой органоид синтезирует АТФ?',
		options: [
			{ id: '1', text: 'Митохондрия' },
			{ id: '2', text: 'Лизосома' },
		],
		correct: '1',
	},
	{
		prompt: 'Что содержит хлорофилл?',
		options: [
			{ id: '1', text: 'Вакуоль' },
			{ id: '2', text: 'Хлоропласт' },
		],
		correct: '2',
	},
]

test('LIFE-05: тест с лимитом показывает таймер, тост за минуту и сдаётся сам по истечении @timed', async ({
	adminPage,
	studentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, {
		prefix: `timed-${projectKey(testInfo)}`,
		questions: QUESTIONS,
		timeLimitMinutes: 2,
	})
	try {
		await page.clock.install()
		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		const startDialog = page.getByRole('alertdialog')
		await expect(startDialog.getByText('Начать тест?')).toBeVisible()
		await startDialog.getByRole('button', { name: 'Начать' }).click()
		await expect(page.getByText(`Отвечено: 0 / ${QUESTIONS.length}`)).toBeVisible()
		await expect(page.getByText(/^0[12]:\d\d$/)).toBeVisible()

		await page.getByRole('radio', { name: 'Митохондрия', exact: true }).click()
		await expect(page.getByText(`Отвечено: 1 / ${QUESTIONS.length}`)).toBeVisible()

		await page.clock.fastForward('01:05')
		await expect(page.getByText('Осталась 1 минута — тест будет сдан автоматически')).toBeVisible()
		await expect(page.getByText(/^00:[0-5]\d$/)).toBeVisible()

		const submitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.clock.fastForward('01:00')
		await expect(page.getByText('Время вышло', { exact: true })).toBeVisible()
		const response = await submitted
		expect(response.status(), 'server accepts the auto-submit within the limit and grace').toBe(200)
		const body = (await response.json()) as { earnedPoints: number; totalPoints: number }
		expect(body.earnedPoints).toBe(1)
		expect(body.totalPoints).toBe(2)

		await page.clock.fastForward('00:10')
		await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible()
		await expect(page.getByText('Баллы: 1 / 2')).toBeVisible()
		await expect(page.getByText('Время вышло', { exact: true })).toHaveCount(0)
		expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
	} finally {
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})
