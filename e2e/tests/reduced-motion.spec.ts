import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4IWeDFTEMpAQACeY2YQMxYLIAAAAASUVORK5CYII=',
	'base64'
)

type Motion = { property: string; duration: string }

async function motionOf(locator: Locator): Promise<Motion> {
	return locator.evaluate((element) => {
		const style = getComputedStyle(element)
		return { property: style.transitionProperty, duration: style.transitionDuration }
	})
}

function isStill(motion: Motion): boolean {
	return motion.property === 'none' || motion.duration.split(',').every((part) => Number.parseFloat(part) === 0)
}

async function openEditor(page: Page, slug: string): Promise<Locator> {
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok()).toBe(true)
	const [question] = ((await response.json()) as { questions: { id: string }[] }).questions
	await page.goto(`/admin/tests/${TOPIC_SLUG}/${slug}/questions/${question.id}`)
	const editor = page.getByRole('textbox').first()
	await expect(editor).toHaveAttribute('contenteditable', 'true')
	return editor
}

async function readMotion(page: Page, slug: string, filename: string) {
	const editor = await openEditor(page, slug)
	await editor.click()
	await page.keyboard.press('End')
	await page.keyboard.press('Shift+Home')
	const toolbar = page.locator('div.will-change-transform.transition-opacity')
	await expect(toolbar).toHaveCount(1)
	const floating = await motionOf(toolbar)

	await page.getByRole('button', { name: 'Медиатека' }).first().click()
	const library = page.getByRole('dialog', { name: 'Медиатека' })
	await expect(library).toBeVisible()
	const card = library.getByRole('button', { name: filename, exact: true })
	await expect(card).toBeVisible()
	const libraryImage = await motionOf(card.locator('img'))
	const libraryDelete = await motionOf(card.locator('xpath=..').getByTitle('Удалить'))
	await page.keyboard.press('Escape')
	await expect(library).toBeHidden()

	await page.locator('header button:has(svg[class*="lucide-search"])').click()
	const search = page.getByRole('dialog', { name: 'Поиск' })
	await expect(search).toBeVisible()
	const tab = search.locator('aside button').first()
	await expect(tab).toBeVisible()
	const searchTab = await motionOf(tab)
	await page.keyboard.press('Escape')
	await expect(search).toBeHidden()
	return { floating, libraryImage, libraryDelete, searchTab }
}

test('RT-03: при prefers-reduced-motion анимации поиска, медиатеки и плавающей панели отключены @rt03', async ({
	adminPage: page,
}, testInfo) => {
	const slug = seedTest(projectKey(testInfo), 'editor').slug
	const upload = await page.request.post('/api/docs/assets', {
		multipart: { file: { name: `motion-${projectKey(testInfo)}.png`, mimeType: 'image/png', buffer: PNG } },
	})
	expect(upload.ok(), 'setup: upload image').toBe(true)
	const asset = (await upload.json()) as { path: string; filename: string }
	try {
		await page.emulateMedia({ reducedMotion: 'no-preference' })
		const control = await readMotion(page, slug, asset.filename)
		expect(isStill(control.floating), `control floating ${JSON.stringify(control.floating)}`).toBe(false)
		expect(isStill(control.libraryImage), `control library image ${JSON.stringify(control.libraryImage)}`).toBe(false)
		expect(isStill(control.libraryDelete), `control library delete ${JSON.stringify(control.libraryDelete)}`).toBe(
			false
		)
		expect(isStill(control.searchTab), `control search tab ${JSON.stringify(control.searchTab)}`).toBe(false)

		await page.emulateMedia({ reducedMotion: 'reduce' })
		const reduced = await readMotion(page, slug, asset.filename)
		expect(isStill(reduced.floating), `reduced floating ${JSON.stringify(reduced.floating)}`).toBe(true)
		expect(isStill(reduced.libraryImage), `reduced library image ${JSON.stringify(reduced.libraryImage)}`).toBe(true)
		expect(isStill(reduced.libraryDelete), `reduced library delete ${JSON.stringify(reduced.libraryDelete)}`).toBe(true)
		expect(isStill(reduced.searchTab), `reduced search tab ${JSON.stringify(reduced.searchTab)}`).toBe(true)
	} finally {
		await page.request.delete('/api/docs/assets', { data: { path: asset.path } })
	}
})
