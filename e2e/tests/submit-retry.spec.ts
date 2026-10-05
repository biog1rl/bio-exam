import { type Page, type Request } from '@playwright/test'

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
	type OwnTest,
} from '../fixtures/exam'

const QUESTIONS: OwnQuestion[] = [
	{
		prompt: 'Какой органоид синтезирует белок?',
		options: [
			{ id: '1', text: 'Рибосома' },
			{ id: '2', text: 'Вакуоль' },
		],
		correct: '1',
	},
	{
		prompt: 'Где происходит фотосинтез?',
		options: [
			{ id: '1', text: 'В лизосоме' },
			{ id: '2', text: 'В хлоропласте' },
		],
		correct: '2',
	},
]

const RETRY_BANNER = 'Не удалось сохранить ответы. Попробуйте еще раз.'

type SubmitBody = { sessionId: string; clientAttemptId: string; answers: Record<string, unknown> }

async function answerAll(page: Page, own: OwnTest): Promise<void> {
	await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
	await expect(page.getByText(`Отвечено: 0 / ${QUESTIONS.length}`)).toBeVisible()
	for (const [index, question] of QUESTIONS.entries()) {
		const text = question.options!.find((option) => option.id === question.correct)!.text
		const radio = page.getByRole('radio', { name: text, exact: true })
		await radio.click()
		await expect(radio).toBeChecked()
		if (index < QUESTIONS.length - 1) await page.getByRole('button', { name: 'Далее' }).click()
	}
	await expect(page.getByText(`Отвечено: ${QUESTIONS.length} / ${QUESTIONS.length}`)).toBeVisible()
}

function collectSubmits(page: Page): SubmitBody[] {
	const bodies: SubmitBody[] = []
	page.on('request', (request: Request) => {
		if (isSubmitRequest(request.url(), request.method())) bodies.push(request.postDataJSON() as SubmitBody)
	})
	return bodies
}

test.describe('ATT-04 и LIFE-05: повтор отправки даёт одну попытку', () => {
	test('ATT-04: ответ submit потерян после записи на сервере, «Повторить» не создаёт вторую попытку @att04', async ({
		adminPage,
		studentPage: page,
	}, testInfo) => {
		const own = await createOwnTest(adminPage, page, { prefix: `att04-${projectKey(testInfo)}`, questions: QUESTIONS })
		try {
			const bodies = collectSubmits(page)
			let reachedServer = 0
			await page.route(
				/\/api\/tests\/public\/tests\/[^/]+\/submit$/,
				async (route) => {
					const response = await route.fetch()
					reachedServer = response.status()
					await route.abort('connectionreset')
				},
				{ times: 1 }
			)
			await answerAll(page, own)
			await page.getByRole('button', { name: 'Завершить' }).first().click()
			await expect(page.getByRole('alert').filter({ hasText: RETRY_BANNER })).toBeVisible()
			expect(reachedServer, 'the first submit was processed by the server').toBe(200)
			expect(await attemptIdsOf(page, own.id)).toHaveLength(1)

			const retried = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
			await page.getByRole('button', { name: 'Повторить' }).click()
			expect((await retried).status()).toBe(200)
			await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible()
			await expect(page.getByText(`Баллы: 2 / 2`)).toBeVisible()

			expect(bodies).toHaveLength(2)
			expect(bodies[1].clientAttemptId).toBe(bodies[0].clientAttemptId)
			expect(bodies[1].sessionId).toBe(bodies[0].sessionId)
			expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
		} finally {
			await deleteOwnTest(adminPage, own)
		}
	})

	test('LIFE-05: «Завершить» без сети, затем сеть и перезагрузка дают одну попытку @life05', async ({
		adminPage,
		studentPage: page,
	}, testInfo) => {
		const own = await createOwnTest(adminPage, page, {
			prefix: `offline-${projectKey(testInfo)}`,
			questions: QUESTIONS,
		})
		try {
			const bodies = collectSubmits(page)
			await answerAll(page, own)
			await page.context().setOffline(true)
			await page.getByRole('button', { name: 'Завершить' }).first().click()
			await expect(page.getByRole('alert').filter({ hasText: RETRY_BANNER })).toBeVisible()
			await page.context().setOffline(false)
			expect(await attemptIdsOf(page, own.id)).toHaveLength(0)

			const resubmitted = page.waitForResponse(
				(response) => isSubmitRequest(response.url(), response.request().method()) && response.status() === 200
			)
			await page.reload()
			await resubmitted
			await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible()

			expect(bodies.length, 'offline submit and resubmit after reload').toBeGreaterThanOrEqual(2)
			const ids = new Set(bodies.map((body) => body.clientAttemptId))
			expect(ids.size, `one clientAttemptId across ${bodies.length} submits`).toBe(1)
			expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
		} finally {
			await page.context().setOffline(false)
			await closeOpenSession(page, own.id)
			await deleteOwnTest(adminPage, own)
		}
	})
})
