import type { Page, TestInfo } from '@playwright/test'

import { seedTest, sessionAccountByPrefix, type SeedTest } from '../fixtures/accounts'
import { expect, newAccountContext, projectKey, test as base } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const WIDTHS = [1280, 768, 375]

const test = base.extend<{ reviewStudentPage: Page }>({
	reviewStudentPage: async ({ browser }, use, testInfo) => {
		const login = sessionAccountByPrefix(projectKey(testInfo), 'review-student').login
		const context = await newAccountContext(browser, testInfo, login)
		await use(await context.newPage())
		await context.close()
	},
})

test.describe.configure({ mode: 'serial' })

function testPath(seedItem: SeedTest): string {
	return `/tests/${seedItem.topic}/${seedItem.slug}`
}

function reviewTests(testInfo: TestInfo) {
	const key = projectKey(testInfo)
	const account = sessionAccountByPrefix(key, 'review-student')
	return {
		student: account,
		pending: seedTest(key, 'review-pending'),
		graded: seedTest(key, 'review-graded'),
		submit: seedTest(key, 'review-submit'),
	}
}

const LABEL_TEXT = /проверк|авто|учителем|предварительно/

const OPEN_ANSWER_TEXT = 'Хлоропласт поглощает свет и запускает синтез глюкозы.'
const REVIEW_COMMENT = 'Верно, но не названы световая и темновая фазы.'

async function expectCleanLayout(page: Page, label: string, options: { labelsOnly?: boolean } = {}): Promise<void> {
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 })
		const lowContrast = await lowContrastTexts(page)
		expect(
			options.labelsOnly ? lowContrast.filter((text) => LABEL_TEXT.test(text)) : lowContrast,
			`${label}: low contrast at ${width}px`
		).toEqual([])
		expect(await horizontalOverflow(page), `${label}: horizontal overflow at ${width}px`).toEqual([])
	}
}

function rowWithLink(page: Page, href: string) {
	return page.getByRole('row').filter({ has: page.locator(`a[href="${href}"]`) })
}

async function attemptIdOf(admin: Page, testTitle: string): Promise<string> {
	const response = await admin.request.get('/api/tests/admin/attempts', { params: { q: testTitle, status: 'all' } })
	expect(response.ok(), `read attempts for ${testTitle}`).toBe(true)
	const rows = ((await response.json()) as { rows: { attemptId: string; testTitle: string }[] }).rows
	const row = rows.find((item) => item.testTitle === testTitle)
	if (!row) throw new Error(`no attempt for test ${testTitle}`)
	return row.attemptId
}

test('a student submits a test with an open question and sees «На проверке» without a percent', async ({
	reviewStudentPage: page,
}, testInfo) => {
	const { submit } = reviewTests(testInfo)
	await page.goto(testPath(submit))
	await expect(page.getByRole('heading', { level: 1, name: submit.title })).toBeVisible()
	await page.getByRole('link', { name: 'Начать тест' }).click()
	await expect(page.getByText('Отвечено: 0 / 2')).toBeVisible()

	await page.getByRole('radio', { name: 'Хлоропласт', exact: true }).click()
	await expect(page.getByText('Отвечено: 1 / 2')).toBeVisible()
	await page.getByRole('button', { name: 'Далее' }).click()
	await page.getByRole('textbox', { name: 'Развёрнутый ответ' }).fill(OPEN_ANSWER_TEXT)
	await expect(page.getByText('Отвечено: 2 / 2')).toBeVisible()
	await page.getByRole('button', { name: 'Завершить' }).first().click()

	const panel = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Результат' }) })
	await page.getByRole('button', { name: 'Готово, фото загружены' }).click()
	await expect(page.getByRole('button', { name: 'Готово, фото загружены' })).toHaveCount(0)
	await expect(panel).toContainText('На проверке')
	await expect(panel).toContainText('предварительно 1 из 1')
	await expect(panel).toContainText('Процент и итог появятся после проверки учителем.')
	await expect(panel).not.toContainText('Процент:')
	await expect(panel).not.toContainText('%')

	await page.getByRole('button', { name: 'Мои попытки' }).click()
	const row = page.getByRole('listitem').filter({ hasText: 'предварительно 1 из 1' })
	await expect(row).toContainText('На проверке')
	await expect(row).not.toContainText('%')
	await expectCleanLayout(page, 'экран после сдачи', { labelsOnly: true })
})

test('the student sees pending and graded attempts on the test page and the dashboard', async ({
	reviewStudentPage: page,
}, testInfo) => {
	const { pending, graded } = reviewTests(testInfo)

	await page.goto(testPath(pending))
	await expect(page.getByRole('heading', { level: 1, name: pending.title })).toBeVisible()
	const pendingRow = page.getByRole('row').filter({ hasText: 'На проверке' })
	await expect(pendingRow).toHaveCount(1)
	await expect(pendingRow).toContainText('1 из 1')
	await expect(pendingRow).not.toContainText('%')
	await expectCleanLayout(page, 'страница теста на проверке')

	await page.goto(testPath(graded))
	await expect(page.getByRole('heading', { level: 1, name: graded.title })).toBeVisible()
	const gradedRow = page.getByRole('row').filter({ hasText: 'Проверено учителем' })
	await expect(gradedRow).toHaveCount(1)
	await expect(gradedRow).toContainText('75%')
	await expect(gradedRow).not.toContainText('На проверке')
	await expectCleanLayout(page, 'страница проверенного теста')

	await page.goto('/dashboard')
	const pendingCard = page
		.getByRole('row')
		.filter({ has: page.locator(`a[href$="/${pending.slug}"]`) })
		.filter({ hasText: 'На проверке' })
	await expect(pendingCard).toHaveCount(1)
	await expect(pendingCard).toContainText('1 из 1')
	await expect(pendingCard).not.toContainText('%')
	const gradedCard = page
		.getByRole('row')
		.filter({ has: page.locator(`a[href$="/${graded.slug}"]`) })
		.filter({ hasText: '75%' })
	await expect(gradedCard).toHaveCount(1)
	await expect(gradedCard).not.toContainText('На проверке')
})

test('the list of attempts shows pending and graded rows and the review filter narrows them', async ({
	adminPage: page,
}, testInfo) => {
	const { student, pending, graded, submit } = reviewTests(testInfo)
	const pendingId = await attemptIdOf(page, pending.title)
	const gradedId = await attemptIdOf(page, graded.title)
	const submitId = await attemptIdOf(page, submit.title)

	await page.goto('/admin/attempts')
	await expect(page.getByRole('heading', { level: 1, name: 'Попытки', exact: true })).toBeVisible()
	await page.getByRole('searchbox', { name: 'Поиск попыток' }).fill(student.name)

	const pendingRow = rowWithLink(page, `/admin/attempts/${pendingId}`)
	const gradedRow = rowWithLink(page, `/admin/attempts/${gradedId}`)
	const submitRow = rowWithLink(page, `/admin/attempts/${submitId}`)
	await expect(pendingRow).toBeVisible()
	await expect(gradedRow).toBeVisible()
	await expect(submitRow).toBeVisible()

	await expect(pendingRow).toContainText('На проверке')
	await expect(pendingRow).toContainText('1 из 1')
	await expect(pendingRow).not.toContainText('%')
	await expect(pendingRow).not.toContainText('Пройден')
	await expect(pendingRow).not.toContainText('Не пройден')
	await expect(gradedRow).toContainText('Проверено учителем')
	await expect(gradedRow).toContainText('75%')
	await expect(gradedRow).not.toContainText('На проверке')
	await expectCleanLayout(page, 'список попыток')

	await page.setViewportSize({ width: 1280, height: 900 })
	const reviewFilter = page.getByRole('button', { name: 'Фильтр по проверке' })
	await reviewFilter.click()
	await page.getByRole('menuitemcheckbox', { name: 'На проверке' }).click()
	await page.keyboard.press('Escape')
	await expect(page).toHaveURL(/review=pending/)
	await expect(pendingRow).toBeVisible()
	await expect(submitRow).toBeVisible()
	await expect(gradedRow).toHaveCount(0)

	await reviewFilter.click()
	await page.getByRole('menuitemcheckbox', { name: 'На проверке' }).click()
	await page.getByRole('menuitemcheckbox', { name: 'Проверено учителем' }).click()
	await page.keyboard.press('Escape')
	await expect(page).toHaveURL(/review=graded/)
	await expect(gradedRow).toBeVisible()
	await expect(pendingRow).toHaveCount(0)
	await expect(submitRow).toHaveCount(0)

	await reviewFilter.click()
	await page.getByRole('menuitem', { name: 'Сбросить' }).click()
	await expect(page).not.toHaveURL(/review=/)
	await expect(pendingRow).toBeVisible()
	await expect(gradedRow).toBeVisible()

	const tile = page.getByRole('button', { name: /^Только на проверке: \d+$/ })
	await expect(tile).toHaveAttribute('aria-pressed', 'false')
	await tile.click()
	await expect(page).toHaveURL(/review=pending/)
	await expect(tile).toHaveAttribute('aria-pressed', 'true')
	await expect(gradedRow).toHaveCount(0)
	await expect(pendingRow).toBeVisible()

	await page.getByRole('button', { name: 'Фильтр по ученикам' }).click()
	await page.getByRole('option', { name: /^Неактивные/ }).click()
	await page.keyboard.press('Escape')
	await expect(page).toHaveURL(/status=all/)
	await expect(page).toHaveURL(/review=pending/)
	await expect(pendingRow).toBeVisible()
	await expect(gradedRow).toHaveCount(0)

	await tile.click()
	await expect(page).not.toHaveURL(/review=/)
	await expect(gradedRow).toBeVisible()
})

test('the reviewer sees the labels in the attempt review, the profile, the dashboard and the search', async ({
	adminPage: page,
}, testInfo) => {
	const { student, pending, graded, submit } = reviewTests(testInfo)
	const pendingId = await attemptIdOf(page, pending.title)
	const gradedId = await attemptIdOf(page, graded.title)
	const submitId = await attemptIdOf(page, submit.title)

	await page.goto(`/admin/attempts/${pendingId}`)
	await expect(page.getByRole('heading', { level: 1, name: 'Разбор результата' })).toBeVisible()
	const hero = page.locator('section', { has: page.getByRole('heading', { level: 1 }) }).first()
	await expect(hero).toContainText('На проверке')
	await expect(hero).toContainText('1 из 1')
	await expect(hero).toContainText('Процент и итог появятся после проверки.')
	await expect(hero).toContainText('баллов автопроверки')
	await expect(hero).not.toContainText('%')
	await expect(page.locator('#question-1')).toContainText('На проверке')
	await expect(page.locator('#question-1')).toContainText('до 3 балл.')
	await expectCleanLayout(page, 'разбор попытки на проверке')

	await page.goto(`/admin/attempts/${gradedId}`)
	await expect(page.getByRole('heading', { level: 1, name: 'Разбор результата' })).toBeVisible()
	const gradedHero = page.locator('section', { has: page.getByRole('heading', { level: 1 }) }).first()
	await expect(gradedHero).toContainText('75%')
	await expect(gradedHero).toContainText('Проверено учителем')
	await expect(gradedHero).not.toContainText('Процент и итог появятся')
	await expectCleanLayout(page, 'разбор проверенной попытки')

	await page.goto(`/profile/${student.login}`)
	await expect(page.getByRole('heading', { level: 1, name: student.name })).toBeVisible()
	const pendingRow = rowWithLink(page, `/admin/attempts/${pendingId}`)
	const gradedRow = rowWithLink(page, `/admin/attempts/${gradedId}`)
	await expect(pendingRow).toBeVisible()
	await expect(pendingRow).toContainText('На проверке')
	await expect(pendingRow).toContainText('1 из 1')
	await expect(pendingRow).not.toContainText('%')
	await expect(pendingRow).not.toContainText('Пройден')
	await expect(pendingRow).not.toContainText('Не пройден')
	await expect(gradedRow).toContainText('Проверено учителем')
	await expect(gradedRow).toContainText('75%')
	await expectCleanLayout(page, 'профиль ученика')

	await page.goto('/dashboard')
	const dashboardRows = rowWithLink(page, `/admin/attempts/${submitId}`)
	await expect(dashboardRows).toHaveCount(1)
	for (const dashboardRow of await dashboardRows.all()) {
		await expect(dashboardRow).toBeVisible()
		await expect(dashboardRow).toContainText('На проверке')
		await expect(dashboardRow).toContainText('1 из 1')
		await expect(dashboardRow).not.toContainText('%')
	}

	await page.setViewportSize({ width: 1280, height: 900 })
	await page.keyboard.press('Control+k')
	const input = page.getByPlaceholder('Введите запрос')
	await expect(input).toBeVisible()
	await input.fill(pending.title)
	const result = page.getByRole('option').filter({ hasText: pending.title }).filter({ hasText: 'На проверке' })
	await expect(result).toHaveCount(1)
	await expect(result).not.toContainText('%')
})

test('the reviewer grades the open answer and the student sees the score and the comment', async ({
	adminPage: admin,
	reviewStudentPage: student,
}, testInfo) => {
	const { submit } = reviewTests(testInfo)
	const submitId = await attemptIdOf(admin, submit.title)

	await admin.goto(`/admin/attempts/${submitId}`)
	await expect(admin.getByRole('heading', { level: 1, name: 'Разбор результата' })).toBeVisible()
	await expect(admin.getByText(OPEN_ANSWER_TEXT)).toBeVisible()
	await admin.getByRole('radio', { name: '2', exact: true }).click()
	await admin.getByRole('textbox', { name: 'Комментарий' }).fill(REVIEW_COMMENT)
	await admin.getByRole('button', { name: 'Сохранить оценку' }).click()
	await expect(admin.getByText('Оценено: 2')).toBeVisible()
	const hero = admin.locator('section', { has: admin.getByRole('heading', { level: 1 }) }).first()
	await expect(hero).toContainText('75%')
	await expect(hero).toContainText('Проверено учителем')
	await expectCleanLayout(admin, 'проверка открытого ответа')

	await student.goto(`${testPath(submit)}/attempts/${submitId}`)
	await expect(student.getByText('Оценка: 2 из 3')).toBeVisible()
	await expect(student.getByText(REVIEW_COMMENT)).toBeVisible()
	await expect(student.getByText(OPEN_ANSWER_TEXT)).toBeVisible()
	await expect(student.getByText('75%').first()).toBeVisible()
	await expectCleanLayout(student, 'результат проверки у ученика')
})

async function drawnJpeg(page: Page, label: string): Promise<Buffer> {
	const base64 = await page.evaluate(async (text) => {
		const canvas = document.createElement('canvas')
		canvas.width = 640
		canvas.height = 480
		const context = canvas.getContext('2d')!
		context.fillStyle = '#2a6'
		context.fillRect(0, 0, 640, 480)
		context.fillStyle = '#fff'
		context.font = 'bold 64px sans-serif'
		context.fillText(text, 40, 120)
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
		const bytes = new Uint8Array(await blob!.arrayBuffer())
		let binary = ''
		for (const byte of bytes) binary += String.fromCharCode(byte)
		return btoa(binary)
	}, label)
	return Buffer.from(base64, 'base64')
}

async function submitWithPhotos(student: Page, slug: string, photoCount: number): Promise<string> {
	const listed = await student.request.get('/api/tests/public/tests')
	expect(listed.ok()).toBe(true)
	const testId = ((await listed.json()) as { tests: { id: string; slug: string }[] }).tests.find(
		(item) => item.slug === slug
	)?.id
	if (!testId) throw new Error(`no test ${slug}`)
	const detail = await student.request.get(`/api/tests/public/tests/${testId}`)
	const questions = ((await detail.json()) as { questions: { id: string; type: string }[] }).questions
	const radio = questions.find((item) => item.type === 'radio')
	const open = questions.find((item) => item.type === 'open')
	if (!radio || !open) throw new Error(`test ${slug} has no radio and open questions`)

	const started = await student.request.post(`/api/tests/public/tests/${testId}/start`)
	expect(started.ok()).toBe(true)
	const sessionId = ((await started.json()) as { sessionId: string }).sessionId
	for (let index = 0; index < photoCount; index++) {
		const uploaded = await student.request.put(
			`/api/tests/public/tests/${testId}/sessions/${sessionId}/questions/${open.id}/photos/${crypto.randomUUID()}`,
			{
				multipart: {
					file: {
						name: `photo-${index + 1}.jpg`,
						mimeType: 'image/jpeg',
						buffer: await drawnJpeg(student, `Фото ${index + 1}`),
					},
				},
			}
		)
		expect(uploaded.status()).toBe(201)
	}
	const submitted = await student.request.post(`/api/tests/public/tests/${testId}/submit`, {
		data: {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [radio.id]: '1', [open.id]: OPEN_ANSWER_TEXT },
		},
	})
	expect(submitted.ok()).toBe(true)
	return ((await submitted.json()) as { attemptId: string }).attemptId
}

test('the reviewer opens the answer photos in the viewer, moves to the second one and closes it with Esc', async ({
	adminPage: admin,
	reviewStudentPage: student,
}, testInfo) => {
	const { submit } = reviewTests(testInfo)
	const attemptId = await submitWithPhotos(student, submit.slug, 2)

	await admin.goto(`/admin/attempts/${attemptId}`)
	const thumbnail = admin.getByRole('button', { name: 'Открыть фото 1' })
	await thumbnail.click()

	const viewer = admin.getByRole('dialog')
	await expect(viewer.getByRole('heading', { name: 'Фото 1 из 2' })).toBeVisible()
	await admin.keyboard.press('ArrowRight')
	await expect(viewer.getByRole('heading', { name: 'Фото 2 из 2' })).toBeVisible()
	await admin.keyboard.press('ArrowRight')
	await expect(viewer.getByRole('heading', { name: 'Фото 2 из 2' })).toBeVisible()
	await admin.keyboard.press('Escape')
	await expect(viewer).toHaveCount(0)
	await expect(thumbnail).toBeFocused()
})
