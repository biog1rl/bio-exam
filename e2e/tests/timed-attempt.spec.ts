import type { Locator } from '@playwright/test'

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
import { horizontalOverflow } from '../fixtures/page-checks'

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
		await expect(page.getByRole('timer')).toHaveText(/0[12]:\d\d$/)

		await page.getByRole('radio', { name: 'Митохондрия', exact: true }).click()
		await expect(page.getByText(`Отвечено: 1 / ${QUESTIONS.length}`)).toBeVisible()

		await page.clock.fastForward('01:05')
		await expect(page.getByText('Осталась 1 минута — тест будет сдан автоматически')).toBeVisible()
		await expect(page.getByRole('timer')).toHaveText(/00:[0-5]\d$/)

		const submitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.clock.fastForward('01:00')
		await expect(page.getByText('Время вышло', { exact: true })).toBeVisible()
		await expect(page.getByRole('status').filter({ hasText: 'Отправляем ответы…' })).toBeVisible()
		const response = await submitted
		expect(response.status(), 'server accepts the auto-submit within the limit and grace').toBe(200)
		const body = (await response.json()) as { earnedPoints: number; totalPoints: number }
		expect(body.earnedPoints).toBe(1)
		expect(body.totalPoints).toBe(2)

		await page.clock.fastForward('00:10')
		const accepted = page.getByRole('heading', { name: 'Ответ принят' })
		await expect(accepted).toBeVisible()
		await expect(accepted).toBeFocused()
		const acceptedLine = page.getByText('Время вышло, ответы приняты автоматически.')
		await expect(acceptedLine).toBeVisible()
		await expect(page.getByText('Баллы: 1 из 2')).toBeVisible()
		await expect(page.getByText('Время вышло', { exact: true })).toHaveCount(0)
		const acceptedRatio = await contrastOf(acceptedLine)
		console.log(`contrast: accepted line ${acceptedRatio.toFixed(2)}`)
		expect(acceptedRatio).toBeGreaterThanOrEqual(4.5)
		expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
	} finally {
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})

const READONLY_QUESTIONS: OwnQuestion[] = [
	{ type: 'short_answer', prompt: 'Как называется деление с сохранением числа хромосом?', correct: 'митоз' },
	{
		prompt: 'Какой органоид синтезирует АТФ?',
		options: [
			{ id: '1', text: 'Митохондрия' },
			{ id: '2', text: 'Лизосома' },
		],
		correct: '1',
	},
]

const FAILURE_TEXT = 'Нет связи с сервером. Ответы, которые успели сохраниться, будут приняты в любом случае.'

function contrastOf(locator: Locator): Promise<number> {
	return locator.evaluate((el) => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		if (!ctx) return 0
		const rgba = (color: string): number[] => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = '#000'
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			const d = ctx.getImageData(0, 0, 1, 1).data
			return [d[0], d[1], d[2], d[3] / 255]
		}
		const over = (top: number[], under: number[]) =>
			[0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
		const chain: number[][] = []
		for (let node: Element | null = el; node; node = node.parentElement) {
			const color = rgba(getComputedStyle(node).backgroundColor)
			if (color[3] > 0) chain.push(color)
			if (color[3] >= 1) break
		}
		let bg = [255, 255, 255, 1]
		for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg)
		const luminance = (c: number[]) => {
			const lin = c.slice(0, 3).map((v) => {
				const x = v / 255
				return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
		}
		const fg = over(rgba(getComputedStyle(el).color), bg)
		const a = luminance(fg)
		const b = luminance(bg)
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
	})
}

test('дедлайн без связи: текст только для чтения, панель сбоя, повтор после возврата связи @timed', async ({
	adminPage,
	studentPage: page,
}, testInfo) => {
	const own = await createOwnTest(adminPage, page, {
		prefix: `deadline-readonly-${projectKey(testInfo)}`,
		questions: READONLY_QUESTIONS,
		timeLimitMinutes: 2,
	})
	try {
		await page.clock.install()
		await page.goto(`/tests/${own.topicSlug}/${own.slug}/start`)
		const startDialog = page.getByRole('alertdialog')
		await startDialog.getByRole('button', { name: 'Начать' }).click()
		await expect(page.getByText(`Отвечено: 0 / ${READONLY_QUESTIONS.length}`)).toBeVisible()

		const question = page.locator('section[id^="question-"]')
		const field = question.getByRole('textbox')
		const saved = page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' &&
				/\/sessions\/[^/]+\/answers$/.test(response.url()) &&
				String(response.request().postData()).includes('questionId')
		)
		await field.fill('митоз')
		await page.clock.fastForward('00:02')
		expect((await saved).status()).toBe(200)

		await page.context().setOffline(true)
		await page.clock.fastForward('02:05')

		const panel = page.getByRole('heading', { name: 'Время вышло' }).locator('..')
		await expect(panel.getByRole('alert')).toContainText(FAILURE_TEXT)
		await expect(panel.getByRole('button', { name: 'Отправить ответы' })).toBeVisible()
		await expect(field).toHaveAttribute('readonly', '')
		await expect(field).toHaveValue('митоз')
		await expect(field).not.toHaveAttribute('placeholder')
		await field.focus()
		await page.keyboard.type('xyz')
		await expect(field).toHaveValue('митоз')
		await expect(page.getByRole('timer')).toHaveText(/00:00$/)
		await expect(page.getByRole('button', { name: 'Далее' })).toBeEnabled()
		expect(await attemptIdsOf(page, own.id)).toHaveLength(0)

		for (const width of [375, 768, 1280]) {
			await page.setViewportSize({ width, height: 900 })
			const panelBox = await panel.boundingBox()
			const questionBox = await question.boundingBox()
			expect(
				panelBox && questionBox && panelBox.y + panelBox.height <= questionBox.y,
				`panel above question at ${width}px`
			).toBe(true)
			expect(await horizontalOverflow(page), `horizontal overflow at ${width}px`).toEqual([])
			const fieldRatio = await contrastOf(field)
			const timerRatio = await contrastOf(page.getByRole('timer'))
			console.log(`contrast ${width}px: readonly field ${fieldRatio.toFixed(2)}, timer 00:00 ${timerRatio.toFixed(2)}`)
			expect(fieldRatio, `readonly field contrast at ${width}px`).toBeGreaterThanOrEqual(4.5)
			expect(timerRatio, `timer contrast at ${width}px`).toBeGreaterThanOrEqual(4.5)
		}

		const resubmitted = page.waitForResponse((response) => isSubmitRequest(response.url(), response.request().method()))
		await page.context().setOffline(false)
		expect((await resubmitted).status(), 'auto-submit retried on online without a click').toBe(200)
		await page.clock.fastForward('00:02')
		await expect(page.getByRole('heading', { name: 'Ответ принят' })).toBeVisible()
		await expect(page.getByText('Время вышло', { exact: true })).toHaveCount(0)
		expect(await attemptIdsOf(page, own.id)).toHaveLength(1)
	} finally {
		await page.context().setOffline(false)
		await closeOpenSession(page, own.id)
		await deleteOwnTest(adminPage, own)
	}
})
