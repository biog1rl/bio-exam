import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, newSessionContext, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4IWeDFTEMpAQACeY2YQMxYLIAAAAASUVORK5CYII=',
	'base64'
)

const PROXY_PREFIX = '/api/docs/assets/proxy?path=images%2F'

type StoredQuestion = { id: string; promptText: string }

type UploadedAsset = { path: string; filename: string }

function testPageUrl(slug: string): string {
	return `/admin/tests/${TOPIC_SLUG}/${slug}`
}

async function storedQuestions(page: Page, slug: string): Promise<StoredQuestion[]> {
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok()).toBe(true)
	return ((await response.json()) as { questions: StoredQuestion[] }).questions
}

async function openQuestionEditor(page: Page, slug: string): Promise<Locator> {
	const questions = await storedQuestions(page, slug)
	expect(questions).toHaveLength(1)
	await page.goto(`${testPageUrl(slug)}/questions/${questions[0].id}`)
	const editor = page.getByRole('textbox').first()
	await expect(editor).toHaveAttribute('contenteditable', 'true')
	return editor
}

async function openMediaLibrary(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Медиатека' }).first().click()
	const library = page.getByRole('dialog', { name: 'Медиатека' })
	await expect(library).toBeVisible()
	return library
}

function isUploadResponse(url: string, method: string): boolean {
	return method === 'POST' && new URL(url).pathname === '/api/docs/assets'
}

test.describe('PRIV-01: the full user directory is closed to a student', () => {
	test('student gets 403 on /api/users and a directory without logins @assets', async ({ studentPage: page }) => {
		const list = await page.request.get('/api/users')
		expect(list.status()).toBe(403)

		const directory = await page.request.get(`/api/users/directory?q=${encodeURIComponent('Ст')}`)
		expect(directory.status()).toBe(200)
		const { users } = (await directory.json()) as { users: Record<string, unknown>[] }
		expect(users.length).toBeGreaterThan(0)
		for (const user of users) expect(user).not.toHaveProperty('login')
	})
})

test.describe.serial('STOR-04, STOR-05: an image from the media library in the question of test assets-<p>', () => {
	let uploaded: UploadedAsset | undefined

	test('admin uploads an image, inserts it into the prompt and the student sees it @assets', async ({
		adminPage: page,
		browser,
	}, testInfo) => {
		const seeded = seedTest(projectKey(testInfo), 'assets')
		const editor = await openQuestionEditor(page, seeded.slug)
		await editor.click()

		const library = await openMediaLibrary(page)
		await library.getByRole('tab', { name: 'Загрузить' }).click()
		await library.locator('#media-library-file-input').setInputFiles({
			name: `assets-${projectKey(testInfo)}.png`,
			mimeType: 'image/png',
			buffer: PNG,
		})
		const response = page.waitForResponse((item) => isUploadResponse(item.url(), item.request().method()))
		await library.getByRole('button', { name: 'Загрузить', exact: true }).click()
		const upload = await response
		expect(upload.ok(), 'upload response is ok').toBe(true)
		const asset = (await upload.json()) as UploadedAsset
		expect(asset.path).toBe(`images/${asset.filename}`)

		await library.getByRole('button', { name: asset.filename, exact: true }).click()
		await expect(library).toBeHidden()

		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
		await expect(page).toHaveURL(new RegExp(`${testPageUrl(seeded.slug)}/?$`))
		const [saved] = await storedQuestions(page, seeded.slug)
		expect(saved.promptText).toContain(asset.path)
		uploaded = asset

		const studentContext = await newSessionContext(browser, testInfo, 'user')
		try {
			const student = await studentContext.newPage()
			await student.goto(`/tests/${TOPIC_SLUG}/${seeded.slug}`)
			await expect(student.getByRole('heading', { level: 1, name: seeded.title })).toBeVisible()
			await student.getByRole('link', { name: 'Начать тест' }).click()
			await expect(student).toHaveURL(new RegExp(`/tests/${TOPIC_SLUG}/${seeded.slug}/start/?$`))

			const image = student.locator(`img[src^="${PROXY_PREFIX}${encodeURIComponent(asset.filename)}"]`)
			await expect(image).toHaveCount(1)
			expect(await image.getAttribute('src')).toMatch(/^\/api\/docs\/assets\/proxy\?path=images%2F/)
			await expect
				.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
				.toBeGreaterThan(0)
		} finally {
			await studentContext.close()
		}
	})

	test('media library refuses to delete the image used in a question @assets', async ({
		adminPage: page,
	}, testInfo) => {
		expect(uploaded, 'the image was uploaded by the previous test').toBeDefined()
		const asset = uploaded!
		const seeded = seedTest(projectKey(testInfo), 'assets')
		await openQuestionEditor(page, seeded.slug)

		const library = await openMediaLibrary(page)
		const card = library.getByRole('button', { name: asset.filename, exact: true }).locator('xpath=..')
		await expect(card).toBeVisible()
		await card.getByTitle('Удалить').click()

		const confirm = page.getByRole('alertdialog')
		await expect(confirm).toBeVisible()
		await confirm.getByRole('button', { name: 'Удалить' }).click()

		await expect(confirm.getByRole('alert')).toContainText('Изображение используется в вопросах')
		await expect(confirm).toBeVisible()
		await expect(confirm.getByRole('button', { name: 'Удалить' })).toHaveCount(0)

		await confirm.getByRole('button', { name: 'Отмена' }).click()
		await expect(confirm).toBeHidden()
		await expect(library.getByRole('button', { name: asset.filename, exact: true })).toBeVisible()
	})
})
