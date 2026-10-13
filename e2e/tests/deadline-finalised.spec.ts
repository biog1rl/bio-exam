import type { Locator, Page } from '@playwright/test'

import { seed, sessionAccountByPrefix } from '../fixtures/accounts'
import {
	attemptIdsOf,
	closeOpenSession,
	createOwnTest,
	currentUserId,
	deleteOwnTest,
	expect,
	isSubmitRequest,
	newAccountContext,
	projectKey,
	test as base,
	type OwnQuestion,
} from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const test = base.extend<{ deadlineStudentPage: Page }>({
	deadlineStudentPage: async ({ browser }, use, testInfo) => {
		const login = sessionAccountByPrefix(projectKey(testInfo), 'deadline-student').login
		const context = await newAccountContext(browser, testInfo, login)
		await use(await context.newPage())
		await context.close()
	},
})

test.describe.configure({ mode: 'serial' })

const DEADLINE_TOPIC = 'e2e-deadline'

const UNSENT_PHRASE = 'сохранено и дописано без связи'
const UNSENT_TEXT = `${UNSENT_PHRASE} ${'ы'.repeat(150)}`

const UNSENT_QUESTIONS: OwnQuestion[] = [
	{ type: 'short_answer', prompt: 'Как называется деление с сохранением числа хромосом?', correct: 'митоз' },
]

async function elementContrast(locator: Locator): Promise<number> {
	return locator.evaluate((element) => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) throw new Error('canvas unavailable')
		const rgba = (color: string): number[] => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = '#000'
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			const data = ctx.getImageData(0, 0, 1, 1).data
			return [data[0], data[1], data[2], data[3] / 255]
		}
		const over = (top: number[], under: number[]) =>
			[0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
		const chain: number[][] = []
		for (let node: Element | null = element; node; node = node.parentElement) {
			const color = rgba(getComputedStyle(node).backgroundColor)
			if (color[3] > 0) chain.push(color)
			if (color[3] >= 1) break
		}
		let background = [255, 255, 255, 1]
		for (let i = chain.length - 1; i >= 0; i--) background = over(chain[i], background)
		const luminance = (color: number[]) => {
			const [r, g, b] = color.slice(0, 3).map((value) => {
				const x = value / 255
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * r + 0.7152 * g + 0.0722 * b
		}
		const front = over(rgba(getComputedStyle(element).color), background)
		const a = luminance(front)
		const b = luminance(background)
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
	})
}

test('TIME-01, TIME-03: просроченная сессия с черновиком сдана сервером, ученик видит «Ответ принят» и окно для фото', async ({
	deadlineStudentPage: page,
}, testInfo) => {
	const key = projectKey(testInfo)
	const slug = `deadline-timed-${key}`
	const sessionId = seed.projects[key].sessions?.[0]?.id
	if (!sessionId) throw new Error(`no seeded session for ${key}`)

	const summary = await page.request.get(`/api/tests/public/topics/${DEADLINE_TOPIC}/tests/${slug}?view=summary`)
	expect(summary.ok(), `read test ${slug}`).toBe(true)
	const testId = ((await summary.json()) as { test: { id: string } }).test.id
	const userId = await currentUserId(page)
	const startedAt = new Date(Date.now() - 10 * 60_000).toISOString()
	await page.addInitScript(([storageKey, value]) => window.localStorage.setItem(storageKey, value), [
		`test-session-${testId}-${userId}`,
		JSON.stringify({ sessionId, startedAt }),
	] as const)

	await page.goto(`/tests/${DEADLINE_TOPIC}/${slug}/start`)

	const accepted = page.getByRole('heading', { name: 'Ответ принят' })
	await expect(accepted).toBeVisible()
	await expect(accepted).toBeFocused()
	await expect(page.getByText('Время вышло, ответы приняты автоматически.')).toBeVisible()
	await expect(page.locator('p', { hasText: /^Фото можно добавить до/ })).toBeVisible()
	await expect(page.getByText('Начать тест?')).toHaveCount(0)
	await expect(page.getByRole('alertdialog')).toHaveCount(0)
	expect(await attemptIdsOf(page, testId)).toHaveLength(1)

	const windowLine = page.locator('p', { hasText: /^Фото можно добавить до/ })
	const untilRatio = await elementContrast(windowLine.locator('span').first())
	const countdownRatio = await elementContrast(windowLine.locator('span').nth(1))
	console.log(`contrast: window line ${untilRatio.toFixed(2)}, countdown ${countdownRatio.toFixed(2)}`)
	expect(untilRatio).toBeGreaterThanOrEqual(4.5)
	expect(countdownRatio).toBeGreaterThanOrEqual(4.5)

	await page.setViewportSize({ width: 375, height: 900 })
	await expect(windowLine).toBeVisible()
	expect(await horizontalOverflow(page), 'horizontal overflow at 375px').toEqual([])
})

test('TIME-06: ответ 409 серверной финализации после дедлайна без связи сверяет недошедший текст @timed', async ({
	adminPage,
	deadlineStudentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, {
		prefix: `deadline-unsent-${projectKey(testInfo)}`,
		questions: UNSENT_QUESTIONS,
		timeLimitMinutes: 2,
	})
	try {
		await page.clock.install()
		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		await page.getByRole('alertdialog').getByRole('button', { name: 'Начать' }).click()
		await expect(page.getByText(`Отвечено: 0 / ${UNSENT_QUESTIONS.length}`)).toBeVisible()

		const field = page.locator('section[id^="question-"]').getByRole('textbox')
		const saved = page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' &&
				/\/sessions\/[^/]+\/answers$/.test(response.url()) &&
				String(response.request().postData()).includes('questionId')
		)
		await field.fill('сохранено')
		await page.clock.fastForward('00:02')
		expect((await saved).status()).toBe(200)

		await page.context().setOffline(true)
		await field.fill(UNSENT_TEXT)
		await page.clock.fastForward('00:02')
		await page.clock.fastForward('02:05')

		const panel = page.getByRole('heading', { name: 'Время вышло' }).locator('..')
		await expect(panel.getByRole('button', { name: 'Отправить ответы' })).toBeVisible()
		expect(await attemptIdsOf(page, own.id)).toHaveLength(0)

		const questionId = await page
			.locator('section[id^="question-"]')
			.first()
			.evaluate((element) => element.id.replace(/^question-/, ''))
		await page.route(
			(url) => /\/tests\/[^/]+\/submit$/.test(url.pathname),
			async (route) => {
				const request = route.request()
				const body = request.postDataJSON() as Record<string, unknown>
				const real = await route.fetch({
					postData: JSON.stringify({ ...body, answers: { [questionId]: 'сохранено' } }),
				})
				const view = (await real.json()) as { attemptId: string }
				await route.fulfill({
					status: 409,
					json: {
						error: 'ATTEMPT_ALREADY_SUBMITTED',
						attemptId: view.attemptId,
						submitSource: 'deadline',
						uploadClosesAt: null,
						serverNow: new Date().toISOString(),
						attempt: view,
					},
				})
			},
			{ times: 1 }
		)

		const resubmitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.context().setOffline(false)
		expect((await resubmitted).status(), 'auto-retry after the connection returns').toBe(409)
		await page.clock.fastForward('00:02')

		const accepted = page.getByRole('heading', { name: 'Ответ принят' })
		await expect(accepted).toBeVisible()
		const note = page.getByText('Часть ответа, набранная без связи, не дошла до сервера')
		await expect(note).toBeVisible()
		const unsent = page.getByLabel('Текст вопроса 1 с этого устройства')
		await expect(unsent).toHaveText(UNSENT_TEXT)
		expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
		const unsentKeys = await page.evaluate(() =>
			Object.keys(window.localStorage).filter((name) => name.startsWith('test-unsent-'))
		)
		expect(unsentKeys, 'unsent text stays in localStorage').toHaveLength(1)

		await page.setViewportSize({ width: 375, height: 900 })
		const noteRatio = await elementContrast(note)
		const unsentRatio = await elementContrast(unsent)
		console.log(`contrast 375px: unsent title ${noteRatio.toFixed(2)}, unsent text ${unsentRatio.toFixed(2)}`)
		expect(noteRatio).toBeGreaterThanOrEqual(4.5)
		expect(unsentRatio).toBeGreaterThanOrEqual(4.5)
		const lowContrast = (await lowContrastTexts(page)).filter((entry) => !/«\d+»$/.test(entry))
		expect(lowContrast, 'low contrast texts at 375px outside question number buttons').toEqual([])
		expect(await horizontalOverflow(page), 'horizontal overflow at 375px').toEqual([])

		await page.getByRole('button', { name: 'К вопросу 1' }).click()
		await expect(page.locator('section[id^="question-"] > p[tabindex="-1"]').first()).toBeFocused()
	} finally {
		await page.context().setOffline(false)
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})
