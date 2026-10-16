import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test'

import { seed, seedTest, sessionAccountByPrefix } from '../fixtures/accounts'
import {
	currentUserId,
	expect,
	newAccountContext,
	newPhoneContext,
	newSessionContext,
	openExpiredSeedSession,
	projectKey,
	test,
} from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const JPEG = Buffer.from(
	'/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCYAFNP/9k=',
	'base64'
)

const TELEGRAM_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.2.3'

test.describe.configure({ mode: 'serial' })

let student: BrowserContext
let studentPage: Page
type IssuedLink = { testId: string; sessionId: string; questionId: string; token: string }
const links = new Map<string, IssuedLink>()

test.beforeAll(async ({ browser }, testInfo) => {
	const login = sessionAccountByPrefix(projectKey(testInfo), 'photo-link-student').login
	student = await newAccountContext(browser, testInfo, login)
	studentPage = await student.newPage()
})

test.afterAll(async () => {
	await student?.close()
})

async function issuedLink(testInfo: TestInfo): Promise<IssuedLink> {
	const cached = links.get(projectKey(testInfo))
	if (cached) return cached
	const item = seedTest(projectKey(testInfo), 'photo-link')
	const read = await studentPage.request.get(`/api/tests/public/topics/${item.topic}/tests/${item.slug}`)
	expect(read.ok(), `read test ${item.slug}`).toBe(true)
	const body = (await read.json()) as {
		test: { id: string }
		questions: { id: string; questionUiTemplate: string }[]
	}
	const questionId = body.questions.find((question) => question.questionUiTemplate === 'open')?.id
	if (!questionId) throw new Error(`no open question in ${item.slug}`)
	const started = await studentPage.request.post(`/api/tests/public/tests/${body.test.id}/start`)
	expect(started.ok(), `start ${item.slug}`).toBe(true)
	const { sessionId } = (await started.json()) as { sessionId: string }
	const issued = await studentPage.request.post(
		`/api/tests/public/tests/${body.test.id}/sessions/${sessionId}/questions/${questionId}/upload-link`
	)
	expect(issued.status(), 'issue upload link').toBe(201)
	const { token } = (await issued.json()) as { token: string }
	const link = { testId: body.test.id, sessionId, questionId, token }
	links.set(projectKey(testInfo), link)
	return link
}

function photoBlock(page: Page) {
	return page.getByRole('group', { name: 'Фото к ответу' })
}

function desktopOnly(testInfo: TestInfo): void {
	test.skip(projectKey(testInfo) === 'mobile', 'один прогон на desktop-проекте')
}

test('телефон без входа открывает ссылку, видит вопрос и добавляет фото; фрагмент в адресе остаётся', async ({
	browser,
}, testInfo) => {
	const { testId, sessionId, questionId, token } = await issuedLink(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	const page = await phone.newPage()
	const authRequests: string[] = []
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/auth/')) authRequests.push(new URL(request.url()).pathname)
	})
	try {
		await page.goto(`/photo-upload#${token}`)
		await expect(page.getByRole('heading', { level: 1, name: 'Вопрос 1' })).toBeVisible()
		await expect(page.getByText(`Фото по ссылке (${projectKey(testInfo)})`, { exact: true })).toBeVisible()
		await expect(page.getByRole('region', { name: 'Текст вопроса' })).toContainText(
			'Сфотографируйте схему фотосинтеза из тетради'
		)
		await expect(photoBlock(page).getByText('0 из 5', { exact: true })).toBeVisible()
		await expect(photoBlock(page).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
		await expect(photoBlock(page).getByRole('button', { name: 'Выбрать из галереи' })).toBeVisible()
		await expect(page.locator('[data-sidebar]')).toHaveCount(0)

		await photoBlock(page)
			.locator('input[type="file"][data-photo-source="gallery"]')
			.setInputFiles({ name: 'phone.jpg', mimeType: 'image/jpeg', buffer: JPEG })
		await expect(photoBlock(page).getByText('1 из 5', { exact: true })).toBeVisible()
		await expect(photoBlock(page).getByRole('img', { name: 'Фото 1' })).toBeVisible()

		const listed = await studentPage.request.get(
			`/api/tests/public/tests/${testId}/sessions/${sessionId}/questions/${questionId}/photos`
		)
		expect(listed.ok()).toBe(true)
		expect(((await listed.json()) as { photos: unknown[] }).photos).toHaveLength(1)

		expect(new URL(page.url()).hash).toBe(`#${token}`)
		await page.waitForLoadState('networkidle')
		expect(authRequests, 'phone context requests to /api/auth/').toEqual([])
	} finally {
		await phone.close()
	}
})

test('неизвестный токен и пустой фрагмент — «Ссылка недействительна»', async ({ browser }, testInfo) => {
	desktopOnly(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const unknown = await phone.newPage()
		await unknown.goto(`/photo-upload#${'A'.repeat(43)}`)
		await expect(unknown.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeVisible()
		await expect(unknown.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeFocused()

		const empty = await phone.newPage()
		await empty.goto('/photo-upload')
		await expect(empty.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeVisible()
		await expect(empty.getByText('Эта ссылка больше не работает или скопирована не полностью.')).toBeVisible()
	} finally {
		await phone.close()
	}
})

test('ответ страницы: no-referrer, noindex, без встраивания во фрейм', async ({ browser }, testInfo) => {
	desktopOnly(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const response = await phone.request.get('/photo-upload')
		expect(response.status()).toBe(200)
		const headers = response.headers()
		expect(headers['referrer-policy']).toBe('no-referrer')
		expect(headers['x-robots-tag']).toContain('noindex')
		expect(headers['x-frame-options']).toBe('DENY')
		expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
		const page = await phone.newPage()
		await page.goto('/photo-upload')
		await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
	} finally {
		await phone.close()
	}
})

test('рабочий экран на 375 px без горизонтальной прокрутки и с контрастным текстом', async ({ browser }, testInfo) => {
	desktopOnly(testInfo)
	const { token } = await issuedLink(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const page = await phone.newPage()
		await page.goto(`/photo-upload#${token}`)
		await expect(photoBlock(page).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
		expect(await horizontalOverflow(page), 'horizontal overflow at 375px').toEqual([])
		expect(await lowContrastTexts(page), 'low contrast texts').toEqual([])
	} finally {
		await phone.close()
	}
})

test('контекст с allowPhotos = false — экран «Фото к этому вопросу не принимаются» без блока фото', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { token } = await issuedLink(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const page = await phone.newPage()
		await page.route('**/api/upload/context', async (route) => {
			const response = await route.fetch()
			const body = (await response.json()) as Record<string, unknown>
			await route.fulfill({ response, json: { ...body, allowPhotos: false } })
		})
		await page.goto(`/photo-upload#${token}`)
		await expect(page.getByRole('heading', { level: 1, name: 'Фото к этому вопросу не принимаются' })).toBeVisible()
		await expect(page.getByText('К ответу на этот вопрос нельзя прикрепить фото.', { exact: true })).toBeVisible()
		await expect(photoBlock(page)).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Сделать фото' })).toHaveCount(0)
		await expect(page.getByText(/из 5$/)).toHaveCount(0)
	} finally {
		await phone.close()
	}
})

test('встроенный браузер Telegram — подсказка и «Скопировать ссылку» сразу, в обычном браузере подсказки нет', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { token } = await issuedLink(testInfo)
	const telegram = await newPhoneContext(browser, testInfo, TELEGRAM_UA)
	const regular = await newPhoneContext(browser, testInfo)
	try {
		const inApp = await telegram.newPage()
		await inApp.goto(`/photo-upload#${token}`)
		await expect(photoBlock(inApp).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
		await expect(inApp.getByText('Откройте страницу в браузере', { exact: true })).toBeVisible()
		await expect(inApp.getByRole('button', { name: 'Скопировать ссылку' })).toBeVisible()

		const plain = await regular.newPage()
		await plain.goto(`/photo-upload#${token}`)
		await expect(photoBlock(plain).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
		await expect(plain.getByText('Откройте страницу в браузере', { exact: true })).toHaveCount(0)
		await expect(plain.getByRole('button', { name: 'Скопировать ссылку' })).toHaveCount(0)
	} finally {
		await telegram.close()
		await regular.close()
	}
})

function runnerBlock() {
	return studentPage.getByRole('group', { name: 'Фото к ответу' })
}

function qrDialog() {
	return studentPage.getByRole('dialog', { name: 'Добавить фото с телефона' })
}

async function openRunner(testInfo: TestInfo): Promise<number> {
	const item = seedTest(projectKey(testInfo), 'photo-link')
	await studentPage.goto(`/tests/${item.topic}/${item.slug}/start`)
	const counter = runnerBlock().getByText(/^\d+ из 5$/)
	await expect(counter).toBeVisible()
	return Number((await counter.innerText()).split(' ')[0])
}

async function openQrDialog(): Promise<string> {
	await runnerBlock().getByRole('button', { name: 'Добавить фото с телефона' }).click()
	await expect(qrDialog()).toBeVisible()
	const field = qrDialog().getByTestId('upload-link')
	await expect(field).toHaveValue(/\/photo-upload#[A-Za-z0-9_-]{43}$/)
	return field.inputValue()
}

async function closeQrDialog(): Promise<void> {
	await studentPage.keyboard.press('Escape')
	await expect(qrDialog()).toHaveCount(0)
	await expect(runnerBlock().getByRole('button', { name: 'Добавить фото с телефона' })).toBeFocused()
}

async function openQuestionId(): Promise<string> {
	return studentPage
		.locator('section[id^="question-"]')
		.first()
		.evaluate((element) => element.id.replace(/^question-/, ''))
}

async function cachedLinkKey(questionId: string): Promise<string> {
	const key = await studentPage.evaluate(
		(suffix) => Object.keys(window.sessionStorage).find((item) => item.endsWith(`:${suffix}`)) ?? null,
		questionId
	)
	if (!key) throw new Error('no cached upload link')
	return key
}

let dialogUrl = ''

test('«С телефона» на компьютере: ссылка из диалога, фото с телефона появляется в блоке без перезагрузки', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const before = await openRunner(testInfo)
	dialogUrl = await openQrDialog()
	await expect(qrDialog().getByRole('img', { name: 'QR-код для загрузки фото с телефона' })).toBeVisible()
	await expect(qrDialog().getByText(`${before} из 5 фото`, { exact: true })).toBeVisible()

	const phone = await newPhoneContext(browser, testInfo)
	try {
		const page = await phone.newPage()
		await page.goto(dialogUrl)
		await photoBlock(page)
			.locator('input[type="file"][data-photo-source="gallery"]')
			.setInputFiles({ name: 'desk.jpg', mimeType: 'image/jpeg', buffer: JPEG })
		await expect(photoBlock(page).getByText(`${before + 1} из 5`, { exact: true })).toBeVisible()
	} finally {
		await phone.close()
	}

	await expect(qrDialog().getByText(`${before + 1} из 5 фото`, { exact: true })).toBeVisible({ timeout: 10_000 })
	await closeQrDialog()
	await expect(runnerBlock().getByText(`${before + 1} из 5`, { exact: true })).toBeVisible()
	await expect(runnerBlock().getByRole('img', { name: `Фото ${before + 1}` })).toBeVisible()
})

test('после перезагрузки раннера адрес в диалоге тот же, открытая страница телефона работает; 375 px без прокрутки', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const page = await phone.newPage()
		await page.goto(dialogUrl)
		const phoneCounter = photoBlock(page).getByText(/^\d+ из 5$/)
		await expect(phoneCounter).toBeVisible()
		const onPhone = Number((await phoneCounter.innerText()).split(' ')[0])

		await studentPage.reload()
		await openRunner(testInfo)
		expect(await openQrDialog()).toBe(dialogUrl)

		await photoBlock(page)
			.locator('input[type="file"][data-photo-source="gallery"]')
			.setInputFiles({ name: 'again.jpg', mimeType: 'image/jpeg', buffer: JPEG })
		await expect(photoBlock(page).getByText(`${onPhone + 1} из 5`, { exact: true })).toBeVisible()
		await expect(page.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toHaveCount(0)

		await studentPage.setViewportSize({ width: 375, height: 812 })
		await expect(qrDialog()).toBeVisible()
		expect(await horizontalOverflow(studentPage), 'horizontal overflow at 375px').toEqual([])
		await studentPage.setViewportSize({ width: 1280, height: 720 })
		await closeQrDialog()
	} finally {
		await phone.close()
	}
})

test('погашенная ссылка в кэше молча заменяется новой выдачей', async ({}, testInfo) => {
	desktopOnly(testInfo)
	await openRunner(testInfo)
	const key = await cachedLinkKey(await openQuestionId())
	const stale = `${new URL(studentPage.url()).origin}/photo-upload#${'B'.repeat(43)}`
	await studentPage.evaluate(([storageKey, value]) => window.sessionStorage.setItem(storageKey, value), [
		key,
		stale,
	] as const)

	const url = await openQrDialog()
	expect(url).not.toBe(stale)
	await expect(qrDialog().getByText('Не удалось создать ссылку')).toHaveCount(0)
	await closeQrDialog()
})

test('отказ выдачи 403 и выключенные фото показаны в диалоге по контракту', async ({}, testInfo) => {
	desktopOnly(testInfo)
	await openRunner(testInfo)
	const key = await cachedLinkKey(await openQuestionId())
	const issue = /\/questions\/[^/]+\/upload-link$/

	await studentPage.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), key)
	await studentPage.route(issue, (route) => route.fulfill({ status: 403, json: { error: 'Forbidden' } }))
	await runnerBlock().getByRole('button', { name: 'Добавить фото с телефона' }).click()
	await expect(qrDialog().getByText('Не удалось создать ссылку')).toBeVisible()
	await expect(qrDialog().getByText('Недостаточно прав для этого действия. Обратитесь к администратору.')).toBeVisible()
	await expect(qrDialog().getByRole('button', { name: 'Повторить' })).toHaveCount(0)
	await expect(qrDialog().getByTestId('upload-link')).toHaveCount(0)
	await closeQrDialog()
	await studentPage.unroute(issue)

	await studentPage.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), key)
	await studentPage.route(issue, (route) =>
		route.fulfill({ status: 409, json: { error: 'К ответу на этот вопрос нельзя прикрепить фото' } })
	)
	await runnerBlock().getByRole('button', { name: 'Добавить фото с телефона' }).click()
	await expect(qrDialog().getByText('К ответу на этот вопрос нельзя прикрепить фото. QR-код не нужен.')).toBeVisible()
	await expect(qrDialog().getByTestId('upload-link')).toHaveCount(0)
	await expect(qrDialog().getByText(/из 5 фото$/)).toBeVisible()
	await closeQrDialog()
	await studentPage.unroute(issue)
})

const POLL_TIMEOUT = { timeout: 10_000 }

function jpegs(count: number, prefix: string) {
	return Array.from({ length: count }, (_, index) => ({
		name: `${prefix}-${index + 1}.jpg`,
		mimeType: 'image/jpeg',
		buffer: JPEG,
	}))
}

function galleryInput(page: Page) {
	return photoBlock(page).locator('input[type="file"][data-photo-source="gallery"]')
}

function dialogOf(page: Page) {
	return page.getByRole('dialog', { name: 'Добавить фото с телефона' })
}

function postSubmitPanel(page: Page) {
	return page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Добавьте фото к ответам' }) })
}

async function linkFrom(page: Page): Promise<string> {
	const field = dialogOf(page).getByTestId('upload-link')
	await expect(field).toHaveValue(/\/photo-upload#[A-Za-z0-9_-]{43}$/)
	return field.inputValue()
}

async function submitInRunner(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Завершить' }).first().click()
	const unanswered = page.getByRole('alertdialog', { name: 'Есть неотвеченные вопросы' })
	const result = page.getByRole('heading', { level: 2, name: 'Результат' })
	await expect(unanswered.or(result)).toBeVisible()
	if (await unanswered.isVisible()) await unanswered.getByRole('button', { name: 'Всё равно завершить' }).click()
	await expect(result).toBeVisible()
}

async function issueLinkFor(page: Page, testInfo: TestInfo, prefix: string): Promise<IssuedLink> {
	const item = seedTest(projectKey(testInfo), prefix)
	const read = await page.request.get(`/api/tests/public/topics/${item.topic}/tests/${item.slug}`)
	expect(read.ok(), `read test ${item.slug}`).toBe(true)
	const body = (await read.json()) as { test: { id: string }; questions: { id: string; questionUiTemplate: string }[] }
	const questionId = body.questions.find((question) => question.questionUiTemplate === 'open')?.id
	if (!questionId) throw new Error(`no open question in ${item.slug}`)
	const started = await page.request.post(`/api/tests/public/tests/${body.test.id}/start`)
	expect(started.ok(), `start ${item.slug}`).toBe(true)
	const { sessionId } = (await started.json()) as { sessionId: string }
	const issued = await page.request.post(
		`/api/tests/public/tests/${body.test.id}/sessions/${sessionId}/questions/${questionId}/upload-link`
	)
	expect(issued.status(), 'issue upload link').toBe(201)
	const { token } = (await issued.json()) as { token: string }
	return { testId: body.test.id, sessionId, questionId, token }
}

async function accountPage(browser: Browser, testInfo: TestInfo, prefix: string) {
	const context = await newAccountContext(browser, testInfo, sessionAccountByPrefix(projectKey(testInfo), prefix).login)
	return { context, page: await context.newPage() }
}

test('телефон удаляет фото и упирается в лимит; ссылка до сдачи гаснет, QR в окне после сдачи даёт новую; «Готово» закрывает окно телефона', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { context, page } = await accountPage(browser, testInfo, 'photo-flow-student')
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const item = seedTest(projectKey(testInfo), 'photo-single')
		await page.goto(`/tests/${item.topic}/${item.slug}/start`)
		await expect(photoBlock(page).getByText('0 из 5', { exact: true })).toBeVisible()
		await photoBlock(page).getByRole('button', { name: 'Добавить фото с телефона' }).click()
		const beforeSubmit = await linkFrom(page)

		const early = await phone.newPage()
		await early.goto(beforeSubmit)
		await galleryInput(early).setInputFiles(jpegs(5, 'limit'))
		await expect(photoBlock(early).getByText('5 из 5', { exact: true })).toBeVisible()
		for (const name of ['Сделать фото', 'Выбрать из галереи']) {
			await expect(photoBlock(early).getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
		}
		await expect(
			photoBlock(early).getByText('Чтобы добавить другое фото, удалите одно из прикреплённых.')
		).toBeVisible()
		await expect(dialogOf(page).getByText('5 из 5 фото', { exact: true })).toBeVisible(POLL_TIMEOUT)

		await photoBlock(early).getByRole('button', { name: 'Удалить фото 1' }).click()
		await expect(photoBlock(early).getByText('4 из 5', { exact: true })).toBeVisible()
		await expect(dialogOf(page).getByText('4 из 5 фото', { exact: true })).toBeVisible(POLL_TIMEOUT)
		for (let left = 4; left > 0; left--) {
			await photoBlock(early)
				.getByRole('button', { name: /^Удалить фото \d+$/ })
				.first()
				.click()
			await expect(photoBlock(early).getByText(`${left - 1} из 5`, { exact: true })).toBeVisible()
		}
		await expect(dialogOf(page).getByText('0 из 5 фото', { exact: true })).toBeVisible(POLL_TIMEOUT)
		await page.keyboard.press('Escape')
		await expect(photoBlock(page).getByText('0 из 5', { exact: true })).toBeVisible()

		await submitInRunner(page)
		await expect(early.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeVisible(POLL_TIMEOUT)

		const panel = postSubmitPanel(page)
		await expect(panel).toBeVisible()
		await panel.getByRole('button', { name: 'Добавить фото с телефона' }).click()
		const afterSubmit = await linkFrom(page)
		expect(afterSubmit).not.toBe(beforeSubmit)

		const late = await phone.newPage()
		await late.goto(afterSubmit)
		await galleryInput(late).setInputFiles(jpegs(1, 'late'))
		await expect(photoBlock(late).getByText('1 из 5', { exact: true })).toBeVisible()
		await expect(dialogOf(page).getByText('1 из 5 фото', { exact: true })).toBeVisible(POLL_TIMEOUT)
		await page.keyboard.press('Escape')
		await expect(panel.getByText('Нет фото', { exact: true })).toHaveCount(0)

		await panel.getByRole('button', { name: 'Готово, фото загружены' }).click()
		await expect(page.getByRole('alertdialog')).toHaveCount(0)
		await expect(panel).toHaveCount(0)
		await expect(late.getByRole('heading', { level: 1, name: 'Время для фото закончилось' })).toBeVisible(POLL_TIMEOUT)
	} finally {
		await phone.close()
		await context.close()
	}
})

test('после сдачи список вопросов с фото: без фото сверху, порядок не меняется, «Готово» с подтверждением', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { context, page } = await accountPage(browser, testInfo, 'photo-flow-student')
	try {
		const item = seedTest(projectKey(testInfo), 'photo-many')
		await page.goto(`/tests/${item.topic}/${item.slug}/start`)
		await expect(photoBlock(page).getByText('0 из 5', { exact: true })).toBeVisible()
		await photoBlock(page).locator('input[type="file"][data-photo-source="file"]').setInputFiles(jpegs(1, 'first'))
		await expect(photoBlock(page).getByText('1 из 5', { exact: true })).toBeVisible()
		await submitInRunner(page)

		const panel = postSubmitPanel(page)
		const rows = panel.locator(':scope > ul > li')
		await expect(rows).toHaveCount(3)
		const titles = () => rows.evaluateAll((items) => items.map((item) => item.querySelector('p')?.textContent ?? ''))
		expect(await titles()).toEqual(['Вопрос 2', 'Вопрос 3', 'Вопрос 1'])
		await expect(rows.nth(0).getByText('Нет фото', { exact: true })).toBeVisible()
		await expect(rows.nth(1).getByText('Нет фото', { exact: true })).toBeVisible()
		await expect(rows.nth(2).getByText('Нет фото', { exact: true })).toHaveCount(0)

		await rows.nth(0).locator('input[type="file"][data-photo-source="file"]').setInputFiles(jpegs(1, 'second'))
		await expect(rows.nth(0).getByText('1 из 5', { exact: true })).toBeVisible()
		await expect(rows.nth(0).getByText('Нет фото', { exact: true })).toHaveCount(0)
		expect(await titles()).toEqual(['Вопрос 2', 'Вопрос 3', 'Вопрос 1'])

		await panel.getByRole('button', { name: 'Готово, фото загружены' }).click()
		const confirm = page.getByRole('alertdialog', { name: 'Отправить работу без части фото?' })
		await expect(confirm).toContainText(
			'Нет фото у 1 вопроса: 3. Вопрос без текста и без фото получит 0 баллов. После отправки добавить фото будет нельзя.'
		)
		await confirm.getByRole('button', { name: 'Отправить' }).click()
		await expect(panel).toHaveCount(0)
	} finally {
		await context.close()
	}
})

test('админ снимает назначение — открытая страница телефона показывает «Ссылка недействительна»', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { context, page } = await accountPage(browser, testInfo, 'photo-revoke-student')
	const admin = await newSessionContext(browser, testInfo, 'admin')
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const issued = await issueLinkFor(page, testInfo, 'photo-revoke')
		const phonePage = await phone.newPage()
		await phonePage.goto(`/photo-upload#${issued.token}`)
		await expect(phonePage.getByRole('heading', { level: 1, name: 'Вопрос 1' })).toBeVisible()

		const userId = await currentUserId(page)
		const adminPage = await admin.newPage()
		const removed = await adminPage.request.delete(`/api/users/${userId}/test-assignments/${issued.testId}`)
		expect(removed.ok(), 'remove assignment').toBe(true)
		await expect(phonePage.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeVisible(POLL_TIMEOUT)
	} finally {
		await phone.close()
		await admin.close()
		await context.close()
	}
})

test('тест без окна после сдачи: ссылка до сдачи недействительна, отказ окна — «Фото к этому тесту больше не принимаются»', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { context, page } = await accountPage(browser, testInfo, 'photo-revoke-student')
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const issued = await issueLinkFor(page, testInfo, 'photo-none')
		const phonePage = await phone.newPage()
		await phonePage.goto(`/photo-upload#${issued.token}`)
		await galleryInput(phonePage).setInputFiles(jpegs(1, 'none'))
		await expect(photoBlock(phonePage).getByText('1 из 5', { exact: true })).toBeVisible()

		const submitted = await page.request.post(`/api/tests/public/tests/${issued.testId}/submit`, {
			data: { sessionId: issued.sessionId, clientAttemptId: crypto.randomUUID(), answers: {} },
		})
		expect(submitted.ok(), 'submit without photo window').toBe(true)
		await expect(phonePage.getByRole('heading', { level: 1, name: 'Ссылка недействительна' })).toBeVisible(POLL_TIMEOUT)

		const refused = await phone.newPage()
		await refused.route('**/api/upload/context', (route) =>
			route.fulfill({ status: 422, json: { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null } })
		)
		await refused.goto(`/photo-upload#${issued.token}`)
		await expect(
			refused.getByRole('heading', { level: 1, name: 'Фото к этому тесту больше не принимаются' })
		).toBeVisible()
	} finally {
		await phone.close()
		await context.close()
	}
})

test('сдача по дедлайну: в строке окна фото есть «С телефона», фото с телефона приходит в строку', async ({
	browser,
}, testInfo) => {
	desktopOnly(testInfo)
	const { context, page } = await accountPage(browser, testInfo, 'photo-deadline-student')
	const phone = await newPhoneContext(browser, testInfo)
	try {
		const item = seedTest(projectKey(testInfo), 'photo-deadline')
		const session = seed.projects[projectKey(testInfo)].sessions?.find((entry) => entry.test === item.slug)
		if (!session) throw new Error(`no seeded session for ${item.slug}`)
		await openExpiredSeedSession(page, {
			topic: item.topic ?? '',
			slug: item.slug,
			sessionId: session.id,
			startedMinutesAgo: session.startedMinutesAgo,
		})
		await expect(page.getByRole('heading', { level: 2, name: 'Ответ принят' })).toBeVisible()
		const panel = postSubmitPanel(page)
		await expect(panel).toBeVisible()
		await panel.getByRole('button', { name: 'Добавить фото с телефона' }).click()
		const url = await linkFrom(page)

		const phonePage = await phone.newPage()
		await phonePage.goto(url)
		await galleryInput(phonePage).setInputFiles(jpegs(1, 'deadline'))
		await expect(photoBlock(phonePage).getByText('1 из 5', { exact: true })).toBeVisible()
		await expect(dialogOf(page).getByText('1 из 5 фото', { exact: true })).toBeVisible(POLL_TIMEOUT)
		await page.keyboard.press('Escape')
		await expect(panel.getByText('1 из 5', { exact: true })).toBeVisible()
	} finally {
		await phone.close()
		await context.close()
	}
})

test('mobile: в раннере нет «С телефона», страница телефона на 375 px без прокрутки', async ({ browser }, testInfo) => {
	test.skip(projectKey(testInfo) !== 'mobile', 'мобильный проект')
	const { token } = await issuedLink(testInfo)
	const item = seedTest(projectKey(testInfo), 'photo-link')
	await studentPage.goto(`/tests/${item.topic}/${item.slug}/start`)
	await expect(photoBlock(studentPage).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
	await expect(studentPage.getByRole('button', { name: 'Добавить фото с телефона' })).toHaveCount(0)

	const phone = await newPhoneContext(browser, testInfo)
	try {
		const page = await phone.newPage()
		await page.goto(`/photo-upload#${token}`)
		await expect(photoBlock(page).getByRole('button', { name: 'Сделать фото' })).toBeVisible()
		await expect(photoBlock(page).getByRole('button', { name: 'Выбрать из галереи' })).toBeVisible()
		expect(await horizontalOverflow(page), 'horizontal overflow on the phone page').toEqual([])
	} finally {
		await phone.close()
	}
})
