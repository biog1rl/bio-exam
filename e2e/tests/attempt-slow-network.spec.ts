import {
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
	{
		prompt: 'Где хранится ДНК эукариот?',
		options: [
			{ id: '1', text: 'В ядре' },
			{ id: '2', text: 'В рибосоме' },
		],
		correct: '1',
	},
]

const DRAFT_PATCH = /\/api\/tests\/public\/tests\/[^/]+\/sessions\/[^/]+\/answers$/

test('LIFE-05: ответы на вопросы 1 и 2 под задержанным PATCH черновика переживают перезагрузку @life05', async ({
	adminPage,
	studentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, { prefix: `slow-${projectKey(testInfo)}`, questions: QUESTIONS })
	try {
		let release: () => void = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		let held = 0
		await page.route(DRAFT_PATCH, async (route) => {
			if (route.request().method() !== 'PATCH') return route.continue()
			held += 1
			await gate
			await route.continue().catch(() => {})
		})

		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		await expect(page.getByText(`Отвечено: 0 / ${QUESTIONS.length}`)).toBeVisible()
		const firstHeld = page.waitForRequest((request) => request.method() === 'PATCH' && DRAFT_PATCH.test(request.url()))
		await page.getByRole('radio', { name: 'Митохондрия', exact: true }).click()
		await page.getByRole('button', { name: 'Далее' }).click()
		await page.getByRole('radio', { name: 'Хлоропласт', exact: true }).click()
		await expect(page.getByText(`Отвечено: 2 / ${QUESTIONS.length}`)).toBeVisible()
		await firstHeld
		expect(held, 'draft PATCH is held while the student answers').toBeGreaterThan(0)

		await page.reload()
		release()
		await page.unrouteAll({ behavior: 'ignoreErrors' })

		await expect(page.getByText(`Отвечено: 2 / ${QUESTIONS.length}`)).toBeVisible()
		await page.getByRole('button', { name: '1', exact: true }).click()
		await expect(page.getByRole('radio', { name: 'Митохондрия', exact: true })).toBeChecked()
		await page.getByRole('button', { name: '2', exact: true }).click()
		await expect(page.getByRole('radio', { name: 'Хлоропласт', exact: true })).toBeChecked()

		const submitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.getByRole('button', { name: 'Далее' }).click()
		await page.getByRole('radio', { name: 'В ядре', exact: true }).click()
		await page.getByRole('button', { name: 'Завершить' }).first().click()
		const response = await submitted
		expect(response.ok()).toBe(true)
		const body = (await response.json()) as { earnedPoints: number; totalPoints: number }
		expect(body.earnedPoints).toBe(3)
		expect(body.totalPoints).toBe(3)
	} finally {
		await page.unrouteAll({ behavior: 'ignoreErrors' })
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})

test('LIFE-05: ответ и сразу уход по крошкам, возврат показывает ответ @life05', async ({
	adminPage,
	studentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, { prefix: `leave-${projectKey(testInfo)}`, questions: QUESTIONS })
	try {
		await page.route(DRAFT_PATCH, async (route) => {
			if (route.request().method() !== 'PATCH') return route.continue()
			await route.abort('connectionreset')
		})
		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		await expect(page.getByText(`Отвечено: 0 / ${QUESTIONS.length}`)).toBeVisible()
		await page.getByRole('radio', { name: 'Митохондрия', exact: true }).click()
		await page.goto(`/tests/${own.topicSlug}/${own.slug}`)
		await expect(page.getByRole('heading', { level: 1, name: own.title })).toBeVisible()
		await page.unrouteAll({ behavior: 'ignoreErrors' })

		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		await expect(page.getByText(`Отвечено: 1 / ${QUESTIONS.length}`)).toBeVisible()
		await expect(page.getByRole('radio', { name: 'Митохондрия', exact: true })).toBeChecked()
	} finally {
		await page.unrouteAll({ behavior: 'ignoreErrors' })
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})
