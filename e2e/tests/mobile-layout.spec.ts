import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import {
	adminReviewSections,
	answerQuestion,
	closeOpenSession,
	createOwnTest,
	deleteOwnTest,
	expect,
	projectKey,
	takeTest,
	test,
	TOPIC_SLUG,
} from '../fixtures/exam'

const NARROW = { width: 375, height: 667 }

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4IWeDFTEMpAQACeY2YQMxYLIAAAAASUVORK5CYII=',
	'base64'
)

async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
	const widths = await page.evaluate(() => ({
		client: document.documentElement.clientWidth,
		root: document.documentElement.scrollWidth,
		body: document.body.scrollWidth,
	}))
	expect(widths.client, `${where}: viewport width`).toBe(NARROW.width)
	expect(widths.root, `${where}: document scroll width`).toBeLessThanOrEqual(widths.client)
	expect(widths.body, `${where}: body scroll width`).toBeLessThanOrEqual(widths.client)
}

async function expectInsideViewport(locator: Locator, where: string): Promise<void> {
	const box = await locator.boundingBox()
	expect(box, `${where}: element is laid out`).not.toBeNull()
	expect(box!.x, `${where}: left edge`).toBeGreaterThanOrEqual(0)
	expect(box!.x + box!.width, `${where}: right edge`).toBeLessThanOrEqual(NARROW.width + 0.5)
}

async function seedTestId(page: Page, slug: string): Promise<string> {
	const response = await page.request.get(`/api/tests/public/topics/${TOPIC_SLUG}/tests/${slug}`)
	expect(response.ok(), `read test ${slug}`).toBe(true)
	return ((await response.json()) as { test: { id: string } }).test.id
}

test('LIFE-05: страница прохождения на 375px без горизонтальной прокрутки на каждом вопросе @layout375', async ({
	studentPage: page,
}, testInfo) => {
	const seeded = seedTest(projectKey(testInfo), 'all-templates')
	const testId = await seedTestId(page, seeded.slug)
	await page.setViewportSize(NARROW)
	try {
		await page.goto(`/tests/${TOPIC_SLUG}/${seeded.slug}/start`)
		await expect(page.getByText(new RegExp(`Отвечено: \\d+ / ${seeded.questions.length}`))).toBeVisible()
		for (const [index, question] of seeded.questions.entries()) {
			await page.getByRole('button', { name: String(index + 1), exact: true }).click()
			await expect(page.getByText(`${index + 1}.`, { exact: true })).toBeVisible()
			await answerQuestion(page, question, question.correct)
			await expectNoHorizontalScroll(page, `question ${question.key}`)
			await expectInsideViewport(page.locator('section[id^="question-"]'), `question ${question.key}`)
			await expectInsideViewport(page.getByRole('button', { name: 'Завершить' }).first(), `finish ${question.key}`)
		}
	} finally {
		await closeOpenSession(page, testId)
	}
})

test('разбор последовательности из 20 цифр на 375px переносит ячейки без горизонтальной прокрутки @layout375', async ({
	studentPage: page,
	adminPage,
}, testInfo) => {
	const sequenceTest = seedTest(projectKey(testInfo), 'seq-d2')
	const question = sequenceTest.questions[0]
	const longAnswer = '12431243124312431243'
	await page.setViewportSize(NARROW)
	const submitted = await takeTest(page, sequenceTest, { [question.key]: longAnswer })

	const studentCells = page.getByRole('list', { name: 'Разбор по позициям' }).getByRole('listitem')
	await expect(studentCells).toHaveCount(longAnswer.length)
	const studentRows = new Set(
		(await studentCells.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))).map(
			String
		)
	)
	expect(studentRows.size, 'cells wrap onto several rows').toBeGreaterThanOrEqual(2)
	await expectNoHorizontalScroll(page, 'student review')
	await expectInsideViewport(studentCells.last(), 'student last cell')

	await adminPage.setViewportSize(NARROW)
	await adminReviewSections(adminPage, submitted.attemptId, 1)
	const adminCells = adminPage.getByRole('list', { name: 'Разбор по позициям' }).getByRole('listitem')
	await expect(adminCells).toHaveCount(longAnswer.length)
	await expect(adminPage.locator('#question-0').getByText(/Ошибок: \d+/)).toBeVisible()
	await expectNoHorizontalScroll(adminPage, 'admin review')
	await expectInsideViewport(adminCells.last(), 'admin last cell')
	await expectInsideViewport(adminPage.locator('#question-0').getByText(/Ошибок: \d+/), 'admin mistakes line')
})

test('медиатека и отказ удаления используемой картинки на 375px @layout375', async ({
	adminPage: page,
	studentPage,
}, testInfo) => {
	const upload = await page.request.post('/api/docs/assets', {
		multipart: { file: { name: `layout-${projectKey(testInfo)}.png`, mimeType: 'image/png', buffer: PNG } },
	})
	expect(upload.ok(), 'setup: upload image').toBe(true)
	const asset = (await upload.json()) as { path: string; filename: string }
	const own = await createOwnTest(page, studentPage, {
		prefix: `media-${projectKey(testInfo)}`,
		questions: [
			{
				prompt: `Что на рисунке?\n\n![](${asset.path})`,
				options: [
					{ id: '1', text: 'Клетка' },
					{ id: '2', text: 'Ткань' },
				],
				correct: '1',
			},
		],
	})
	try {
		const stored = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${own.slug}`)
		const [questionRow] = ((await stored.json()) as { questions: { id: string }[] }).questions
		await page.setViewportSize(NARROW)
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${own.slug}/questions/${questionRow.id}`)
		const editor = page.getByRole('textbox').first()
		await expect(editor).toHaveAttribute('contenteditable', 'true')
		await editor.click()

		await page.getByRole('button', { name: 'Медиатека' }).first().click()
		const library = page.getByRole('dialog', { name: 'Медиатека' })
		await expect(library).toBeVisible()
		const item = library.getByRole('button', { name: asset.filename, exact: true })
		await expect(item).toBeVisible()
		await expectNoHorizontalScroll(page, 'media library')
		await expectInsideViewport(library, 'media library dialog')

		await item.locator('xpath=..').getByTitle('Удалить').click()
		const confirm = page.getByRole('alertdialog')
		await expect(confirm).toBeVisible()
		await confirm.getByRole('button', { name: 'Удалить' }).click()
		const refusal = confirm.getByRole('alert')
		await expect(refusal).toContainText('Изображение используется в вопросах')
		await expect(confirm.getByRole('button', { name: 'Удалить' })).toHaveCount(0)
		await expectNoHorizontalScroll(page, 'delete refusal')
		await expectInsideViewport(confirm, 'refusal dialog')
		await expectInsideViewport(refusal, 'refusal text')
		await expectInsideViewport(confirm.getByRole('button', { name: 'Отмена' }), 'refusal cancel')
		await confirm.getByRole('button', { name: 'Отмена' }).click()
		await expect(confirm).toBeHidden()
	} finally {
		await deleteOwnTest(page, own)
		await page.request.delete('/api/docs/assets', { data: { path: asset.path } })
	}
})
