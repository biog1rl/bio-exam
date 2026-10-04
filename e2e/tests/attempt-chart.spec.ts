import type { Locator } from '@playwright/test'

import { seed, seedTest, sessionAccount } from '../fixtures/accounts'
import { correctAnswers, expect, newSessionContext, projectKey, takeTest, test } from '../fixtures/exam'

const CHART_NAME = 'График результатов попыток'

async function expectLabelledBars(figure: Locator, title: string): Promise<void> {
	const bars = figure.locator('.recharts-bar-rectangle path')
	await expect(bars.first()).toBeVisible()
	await expect.poll(() => bars.count()).toBeGreaterThanOrEqual(2)

	const labels = figure.locator('text.attempt-bar-label')
	await expect.poll(() => matchingLabelCount(labels, title)).toBeGreaterThanOrEqual(2)
	const first = labels.filter({ hasText: title.slice(0, 3) }).first()
	await expect(first).toBeVisible()

	await expect(figure.locator('.recharts-legend-wrapper').getByText(seed.topic.title, { exact: true })).toBeVisible()
	await expect(figure.locator('.recharts-tooltip-wrapper')).toBeHidden()
}

async function matchingLabelCount(labels: Locator, title: string): Promise<number> {
	const texts = await labels.allTextContents()
	return texts.filter((text) => {
		const prefix = text.replace(/…$/, '')
		return prefix.length > 0 && title.startsWith(prefix)
	}).length
}

test.describe.serial('attempt bar chart', () => {
	test('setup: the student submits the same test twice in one day @progress', async ({ browser }, testInfo) => {
		const sequenceTest = seedTest(projectKey(testInfo), 'seq-d2')
		for (let round = 0; round < 2; round += 1) {
			const context = await newSessionContext(browser, testInfo, 'user')
			try {
				const submitted = await takeTest(await context.newPage(), sequenceTest, correctAnswers(sequenceTest))
				expect(submitted.attemptId).toBeTruthy()
			} finally {
				await context.close()
			}
		}
	})

	test('admin profile shows one visible bar per attempt without hover @progress', async ({
		adminPage: page,
	}, testInfo) => {
		const student = sessionAccount(projectKey(testInfo), 'user')
		await page.goto(`/profile/${student.login}`)
		const figure = page.getByRole('figure', { name: CHART_NAME })
		await expectLabelledBars(figure, seedTest(projectKey(testInfo), 'seq-d2').title)

		await expect(page.getByRole('radio', { name: 'Месяц', exact: true })).toHaveAttribute('aria-checked', 'true')
		expect(new URL(page.url()).searchParams.get('range')).toBeNull()
		await expect(page.getByRole('radio', { name: '3 месяца', exact: true })).toBeVisible()
		await expect(page.getByRole('radio', { name: 'Полгода', exact: true })).toBeVisible()
	})

	test('student dashboard shows each attempt as a labelled bar without hover @progress', async ({
		studentPage: page,
	}, testInfo) => {
		await page.goto('/dashboard')
		await expect(page.getByRole('heading', { name: 'Пройденные тесты', exact: true })).toBeVisible()
		const figure = page.getByRole('figure', { name: CHART_NAME })
		await expectLabelledBars(figure, seedTest(projectKey(testInfo), 'seq-d2').title)
	})
})
