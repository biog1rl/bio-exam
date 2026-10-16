import type { BrowserContext, Page, Route } from '@playwright/test'

import { seedTest, sessionAccountByPrefix } from '../fixtures/accounts'
import { expect, newAccountContext, projectKey, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const JPEG = Buffer.from(
	'/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCYAFNP/9k=',
	'base64'
)

const LIMIT_MESSAGE = 'К ответу можно прикрепить не больше 5 фото'
const TYPE_MESSAGE = 'Поддерживаются фото в форматах JPEG, PNG и WebP'
const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'
const PHOTO_PUT = /\/api\/tests\/public\/tests\/[^/]+\/sessions\/[^/]+\/questions\/[^/]+\/photos\/[^/]+$/

test.describe.configure({ mode: 'serial' })

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }, testInfo) => {
	const login = sessionAccountByPrefix(projectKey(testInfo), 'photo-student').login
	context = await newAccountContext(browser, testInfo, login)
	page = await context.newPage()
})

test.afterAll(async () => {
	await context?.close()
})

function jpegs(count: number, prefix = 'photo') {
	return Array.from({ length: count }, (_, index) => ({
		name: `${prefix}-${index + 1}.jpg`,
		mimeType: 'image/jpeg',
		buffer: JPEG,
	}))
}

function photoBlock() {
	return page.getByRole('group', { name: 'Фото к ответу' })
}

function fileInput() {
	return photoBlock().locator('input[type="file"][data-photo-source="file"]')
}

function counter(text: string) {
	return photoBlock().getByText(text, { exact: true })
}

async function toOpenQuestion(): Promise<void> {
	const choice = page.getByRole('radio', { name: 'Хлоропласт', exact: true })
	await expect(choice.or(photoBlock())).toBeVisible()
	if (await choice.isVisible())
		await page.locator('section[id^="question-"]').getByRole('button', { name: 'Далее' }).click()
	await expect(photoBlock()).toBeVisible()
	await expect(counter('— из 5')).toHaveCount(0)
}

async function onPhotoPut(handler: (route: Route) => Promise<void>): Promise<void> {
	await page.route(PHOTO_PUT, async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback()
		await handler(route)
	})
}

async function removeAll(): Promise<void> {
	for (;;) {
		const button = photoBlock()
			.getByRole('button', { name: /^Удалить фото \d+$/ })
			.first()
		if ((await button.count()) === 0) break
		const before = await photoBlock()
			.getByRole('button', { name: /^Удалить фото \d+$/ })
			.count()
		await button.click()
		await expect(photoBlock().getByRole('button', { name: /^Удалить фото \d+$/ })).toHaveCount(before - 1)
	}
	await expect(counter('0 из 5')).toBeVisible()
}

test('ученик прикрепляет фото к открытому вопросу, видит миниатюру и «1 из 5», после перезагрузки фото на месте', async ({}, testInfo) => {
	const item = seedTest(projectKey(testInfo), 'answer-photos')
	await page.goto(`/tests/${item.topic}/${item.slug}/start`)
	await toOpenQuestion()
	await expect(counter('0 из 5')).toBeVisible()
	await expect(photoBlock().locator('input[type="file"]')).toHaveAttribute('accept', 'image/*')

	await fileInput().setInputFiles(jpegs(1))
	await expect(photoBlock().getByRole('img', { name: 'Фото 1' })).toBeVisible()
	await expect(counter('1 из 5')).toBeVisible()

	await page.reload()
	await toOpenQuestion()
	await expect(photoBlock().getByRole('img', { name: 'Фото 1' })).toBeVisible()
	await expect(counter('1 из 5')).toBeVisible()
})

test('удаление готового фото: «0 из 5», фокус на кнопке выбора, Tab и Enter открывают выбор файла', async () => {
	await photoBlock().getByRole('button', { name: 'Удалить фото 1' }).click()
	await expect(counter('0 из 5')).toBeVisible()
	await expect(photoBlock().getByRole('img')).toHaveCount(0)
	const addButton = photoBlock().getByRole('button', { name: 'Добавить фото' })
	await expect(addButton).toBeFocused()
	expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

	await photoBlock().getByText('Фото к ответу', { exact: true }).focus()
	await page.keyboard.press('Tab')
	await expect(addButton).toBeFocused()
	const chooser = page.waitForEvent('filechooser')
	await page.keyboard.press('Enter')
	expect((await chooser).isMultiple()).toBe(true)
})

test('файл не изображение: текст сервера, «Убрать», контраст в норме', async () => {
	await fileInput().setInputFiles({ name: 'note.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('просто текст') })
	await expect(photoBlock().getByText(TYPE_MESSAGE, { exact: true })).toBeVisible()
	await expect(counter('0 из 5')).toBeVisible()
	expect(await lowContrastTexts(page)).toEqual([])
	await photoBlock().getByRole('button', { name: 'Убрать фото 1' }).click()
	await expect(photoBlock().getByText(TYPE_MESSAGE, { exact: true })).toHaveCount(0)
	await expect(photoBlock().getByRole('button', { name: 'Добавить фото' })).toBeFocused()
})

test('сбой сети: три автоповтора, затем «Повторить» отправляет то же фото', async () => {
	test.setTimeout(90_000)
	const photoIds: string[] = []
	await onPhotoPut(async (route) => {
		photoIds.push(new URL(route.request().url()).pathname.split('/').at(-1) ?? '')
		await route.abort('failed')
	})
	await fileInput().setInputFiles(jpegs(1))
	await expect(photoBlock().getByText('Повторная попытка…')).toBeVisible()
	const retryButton = photoBlock().getByRole('button', { name: 'Повторить загрузку фото 1' })
	await expect(retryButton).toBeVisible({ timeout: 30_000 })
	await expect(photoBlock().getByText(NETWORK_MESSAGE, { exact: true })).toBeVisible()
	expect(photoIds).toHaveLength(4)
	expect(new Set(photoIds).size).toBe(1)
	expect(await lowContrastTexts(page)).toEqual([])

	await page.unrouteAll({ behavior: 'wait' })
	const retried = page.waitForRequest((request) => request.method() === 'PUT' && PHOTO_PUT.test(request.url()))
	await retryButton.click()
	expect(new URL((await retried).url()).pathname.split('/').at(-1)).toBe(photoIds[0])
	await expect(photoBlock().getByRole('img', { name: 'Фото 1' })).toBeVisible()
	await expect(counter('1 из 5')).toBeVisible()
	await removeAll()
})

test('переход к другому вопросу во время загрузки не обрывает отправку', async () => {
	await onPhotoPut(async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500))
		await route.fallback()
	})
	await fileInput().setInputFiles(jpegs(1))
	await expect(photoBlock().getByText('Загрузка…')).toBeVisible()
	await page.locator('section[id^="question-"]').getByRole('button', { name: 'Назад' }).click()
	await expect(page.getByRole('radio', { name: 'Хлоропласт', exact: true })).toBeVisible()
	await page.locator('section[id^="question-"]').getByRole('button', { name: 'Далее' }).click()
	await expect(photoBlock().getByRole('img', { name: 'Фото 1' })).toBeVisible()
	await expect(counter('1 из 5')).toBeVisible()
	await page.unrouteAll({ behavior: 'wait' })

	await page.reload()
	await toOpenQuestion()
	await expect(photoBlock().getByRole('img', { name: 'Фото 1' })).toBeVisible()
	await expect(counter('1 из 5')).toBeVisible()
	await removeAll()
})

test('семь фото разом: пять готовых, лишние одной строкой, выбор недоступен, вёрстка держит 375 px', async ({}, testInfo) => {
	await fileInput().setInputFiles(jpegs(7))
	await expect(photoBlock().getByRole('img', { name: /^Фото \d$/ })).toHaveCount(5)
	await expect(counter('5 из 5')).toBeVisible()
	await expect(photoBlock().getByText(LIMIT_MESSAGE, { exact: true })).toBeVisible()
	await expect(photoBlock().getByText('Не добавлено фото: 2', { exact: true })).toBeVisible()
	await expect(photoBlock().getByText('Чтобы добавить другое фото, удалите одно из прикреплённых.')).toBeVisible()
	const addButton = photoBlock().getByRole('button', { name: 'Добавить фото' })
	await expect(addButton).toHaveAttribute('aria-disabled', 'true')
	expect(await lowContrastTexts(page)).toEqual([])
	await photoBlock().screenshot({ path: testInfo.outputPath('photo-block.png') })

	const viewport = page.viewportSize()
	await page.setViewportSize({ width: 375, height: 900 })
	expect(await horizontalOverflow(page)).toEqual([])
	expect(await lowContrastTexts(page)).toEqual([])
	await photoBlock().screenshot({ path: testInfo.outputPath('photo-block-375.png') })
	if (viewport) await page.setViewportSize(viewport)

	await photoBlock().getByRole('button', { name: 'Убрать сообщение о лишних фото' }).click()
	await expect(photoBlock().getByText(LIMIT_MESSAGE, { exact: true })).toHaveCount(0)
	await removeAll()
	await expect(addButton).not.toHaveAttribute('aria-disabled', 'true')
})
