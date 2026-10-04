import { type Page } from '@playwright/test'

import { randomUUID } from 'node:crypto'

import { seedTest, type SeedQuestion, type SeedTest } from '../fixtures/accounts'
import { answerQuestion, expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

async function openRunner(page: Page, seed: SeedTest): Promise<void> {
	await page.goto(`/tests/${TOPIC_SLUG}/${seed.slug}/start`)
	await expect(page.getByText(new RegExp(`Отвечено: \\d+ / ${seed.questions.length}`))).toBeVisible()
}

async function closeOpenAttempt(page: Page, seed: SeedTest): Promise<void> {
	const testResponse = await page.request.get(`/api/tests/public/topics/${TOPIC_SLUG}/tests/${seed.slug}`)
	expect(testResponse.ok(), `cleanup: read test ${seed.slug}`).toBe(true)
	const { test: seededTest } = (await testResponse.json()) as { test: { id: string } }

	const started = await page.request.post(`/api/tests/public/tests/${seededTest.id}/start`)
	expect(started.ok(), `cleanup: start session for ${seed.slug}`).toBe(true)
	const { sessionId } = (await started.json()) as { sessionId: string }

	const submitted = await page.request.post(`/api/tests/public/tests/${seededTest.id}/submit`, {
		data: { sessionId, clientAttemptId: randomUUID(), answers: {} },
	})
	expect(submitted.ok(), `cleanup: submit open session ${sessionId}`).toBe(true)
}

function correctOptionText(question: SeedQuestion): string {
	const text = question.options?.find((option) => option.id === question.correct)?.text
	if (!text) throw new Error(`seed question ${question.key}: no option for key ${String(question.correct)}`)
	return text
}

test.describe.serial('LIFE-02: ответы переживают перезагрузку в окне дебаунса', () => {
	test('подготовка LIFE-02: студент отвечает на вопрос 1 и видит Отвечено: 1 / N @life02', async ({
		studentPage: page,
	}, testInfo) => {
		const seed = seedTest(projectKey(testInfo), 'all-templates')
		const count = seed.questions.length
		try {
			await openRunner(page, seed)
			await expect(page.getByText(`Отвечено: 0 / ${count}`)).toBeVisible()
			const first = seed.questions[0]
			await answerQuestion(page, first, first.correct)
			await expect(page.getByText(`Отвечено: 1 / ${count}`)).toBeVisible()
		} finally {
			await closeOpenAttempt(page, seed)
		}
	})

	test('LIFE-02 known defect (чинит 06-09): ответы на вопросы 1 и 2 в окне дебаунса переживают перезагрузку @known-defect @life02', async ({
		studentPage: page,
	}, testInfo) => {
		test.fail()
		const seed = seedTest(projectKey(testInfo), 'all-templates')
		const count = seed.questions.length
		const [first, second] = seed.questions
		try {
			await openRunner(page, seed)
			await answerQuestion(page, first, first.correct)
			await page.getByRole('button', { name: 'Далее' }).click()
			await answerQuestion(page, second, second.correct)
			await page.reload()

			await expect(page.getByText(`Отвечено: 2 / ${count}`)).toBeVisible()
			await page.getByRole('button', { name: '1', exact: true }).click()
			await expect(page.getByRole('radio', { name: correctOptionText(first), exact: true })).toBeChecked()
		} finally {
			await closeOpenAttempt(page, seed)
		}
	})
})
