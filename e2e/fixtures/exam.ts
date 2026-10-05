/**
 * Общие помощники для сквозных сценариев D-14 (flows 2-4): сессии студента и администратора
 * своего проекта Playwright, прохождение теста через интерфейс и разбор ответа отправки.
 *
 * Сессии берут storageState из auth.setup.ts, поэтому в тестах никто не входит заново: так быстрее
 * (троттлинг входа считает только неудачи, успешные входы не ограничены). Контексты создаются
 * вручную, чтобы в одном тесте работали и студент, и администратор; параметры устройства проекта
 * (viewport, mobile) переносятся из project.use.
 */
import { expect, test as base, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

import {
	projectKeyFromName,
	seed,
	sessionAccount,
	storageStatePath,
	type ProjectKey,
	type RoleKey,
	type SeedQuestion,
	type SeedTest,
} from './accounts'

export const TOPIC_SLUG = seed.topic.slug

/** Баллы за верный ответ по ключу типа (BUILTIN_QUESTION_TYPES.correctPoints на сервере) */
export const POINTS_BY_TYPE: Record<string, number> = {
	radio: 1,
	checkbox: 2,
	matching: 2,
	short_answer: 1,
	sequence: 2,
}

/** Ответ, который студент вводит в вопрос: значение того же вида, что и ключ ответа в сиде */
export type AnswerValue = SeedQuestion['correct']

/** Тело ответа POST /api/tests/public/tests/:id/submit (SubmitResult на сервере) */
export type SubmitPayload = {
	attemptId: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	results: {
		questionId: string
		isCorrect: boolean
		points: number
		earnedPoints: number
		userAnswer: unknown
		correctAnswer: unknown
		status: string
		keyVisible: boolean
		mistakes: number | null
		verdicts: unknown
	}[]
}

export function projectKey(testInfo: TestInfo): ProjectKey {
	return projectKeyFromName(testInfo.project.name)
}

/** Контекст браузера с сохранённой сессией роли и параметрами устройства проекта */
export async function newSessionContext(browser: Browser, testInfo: TestInfo, role: RoleKey): Promise<BrowserContext> {
	return newAccountContext(browser, testInfo, sessionAccount(projectKey(testInfo), role).login)
}

export async function newAccountContext(browser: Browser, testInfo: TestInfo, login: string): Promise<BrowserContext> {
	const use = testInfo.project.use
	return browser.newContext({
		storageState: storageStatePath(login),
		baseURL: use.baseURL,
		viewport: use.viewport ?? undefined,
		userAgent: use.userAgent,
		deviceScaleFactor: use.deviceScaleFactor,
		isMobile: use.isMobile,
		hasTouch: use.hasTouch,
	})
}

/** Тест со страницами студента и администратора своего проекта */
export const test = base.extend<{ studentPage: Page; adminPage: Page; teacherPage: Page }>({
	studentPage: async ({ browser }, use, testInfo) => {
		const context = await newSessionContext(browser, testInfo, 'user')
		await use(await context.newPage())
		await context.close()
	},
	adminPage: async ({ browser }, use, testInfo) => {
		const context = await newSessionContext(browser, testInfo, 'admin')
		await use(await context.newPage())
		await context.close()
	},
	teacherPage: async ({ browser }, use, testInfo) => {
		const context = await newSessionContext(browser, testInfo, 'teacher')
		await use(await context.newPage())
		await context.close()
	},
})

export { expect }

/** Ответы, равные ключам сида, по ключу вопроса */
export function correctAnswers(seedTest: SeedTest): Record<string, AnswerValue> {
	return Object.fromEntries(seedTest.questions.map((question) => [question.key, question.correct]))
}

/** Сумма баллов теста по сиду */
export function totalPointsOf(seedTest: SeedTest): number {
	return seedTest.questions.reduce((sum, question) => sum + POINTS_BY_TYPE[question.type], 0)
}

function optionText(question: SeedQuestion, optionId: string): string {
	const text = question.options?.find((option) => option.id === optionId)?.text
	if (!text) throw new Error(`seed question ${question.key}: no option ${optionId}`)
	return text
}

/** Вводит ответ в вопрос, который сейчас показан в TestRunner */
export async function answerQuestion(page: Page, question: SeedQuestion, value: AnswerValue): Promise<void> {
	if (question.template === 'single_choice') {
		const radio = page.getByRole('radio', { name: optionText(question, value as string), exact: true })
		await radio.click()
		await expect(radio).toBeChecked()
		return
	}
	if (question.template === 'multi_choice') {
		for (const optionId of value as string[]) {
			const checkbox = page.getByRole('checkbox', { name: optionText(question, optionId), exact: true })
			await checkbox.click()
			await expect(checkbox).toBeChecked()
		}
		return
	}
	if (question.template === 'matching') {
		const pairs = question.matchingPairs
		if (!pairs) throw new Error(`seed question ${question.key}: no matching pairs`)
		for (const [leftId, rightId] of Object.entries(value as Record<string, string>)) {
			const left = pairs.left.find((item) => item.id === leftId)
			const right = pairs.right.find((item) => item.id === rightId)
			if (!left || !right) throw new Error(`seed question ${question.key}: unknown pair ${leftId} -> ${rightId}`)
			// Строка пары: подпись слева и select справа в одном контейнере
			const select = page.getByText(left.text, { exact: true }).locator('xpath=..').getByRole('combobox')
			await select.click()
			await page.getByRole('option', { name: right.text, exact: true }).click()
			await expect(select).toContainText(right.text)
		}
		return
	}
	const placeholder = question.template === 'sequence_digits' ? 'Введите последовательность цифр' : 'Введите ответ'
	const input = page.getByPlaceholder(placeholder)
	await input.fill(value as string)
	await expect(input).toHaveValue(value as string)
}

/** Адрес ответа отправки: POST /api/tests/public/tests/<uuid>/submit */
function isSubmitResponse(url: string, method: string): boolean {
	return method === 'POST' && /\/api\/tests\/public\/tests\/[^/]+\/submit$/.test(new URL(url).pathname)
}

/**
 * Студент открывает назначенный тест с его страницы, отвечает на все вопросы по порядку и завершает.
 * Возвращает ответ сервера на отправку: из него берутся id попытки и баллы за каждый вопрос.
 */
export async function takeTest(
	page: Page,
	seedTest: SeedTest,
	answers: Record<string, AnswerValue>
): Promise<SubmitPayload> {
	const topicSlug = seedTest.topic ?? TOPIC_SLUG
	await page.goto(`/tests/${topicSlug}/${seedTest.slug}`)
	await expect(page.getByRole('heading', { level: 1, name: seedTest.title })).toBeVisible()
	await page.getByRole('link', { name: 'Начать тест' }).click()
	await expect(page).toHaveURL(new RegExp(`/tests/${topicSlug}/${seedTest.slug}/start/?$`))

	const count = seedTest.questions.length
	await expect(page.getByText(`Отвечено: 0 / ${count}`)).toBeVisible()

	for (const [index, question] of seedTest.questions.entries()) {
		await expect(page.getByText(`${index + 1}.`, { exact: true })).toBeVisible()
		await answerQuestion(page, question, answers[question.key])
		if (index < count - 1) await page.getByRole('button', { name: 'Далее' }).click()
	}
	await expect(page.getByText(`Отвечено: ${count} / ${count}`)).toBeVisible()

	const submitted = page.waitForResponse((response) => isSubmitResponse(response.url(), response.request().method()))
	// Две кнопки «Завершить»: под вопросом и в боковой панели
	await page.getByRole('button', { name: 'Завершить' }).first().click()
	const response = await submitted
	expect(response.ok(), 'submit response is ok').toBe(true)
	return (await response.json()) as SubmitPayload
}

/** Текст каждого вопроса на странице разбора попытки администратора: /admin/attempts/<id> */
export async function adminReviewSections(page: Page, attemptId: string, questionCount: number): Promise<string[]> {
	await page.goto(`/admin/attempts/${attemptId}`)
	await expect(page.getByRole('heading', { level: 1, name: 'Разбор результата' })).toBeVisible()
	await expect(page.locator('section[id^="question-"]')).toHaveCount(questionCount)
	return page.locator('section[id^="question-"]').allInnerTexts()
}

export type OwnQuestion = {
	type?: 'radio' | 'short_answer'
	prompt: string
	options?: { id: string; text: string }[]
	correct: string
}

export type OwnTest = { id: string; slug: string; title: string; topicSlug: string }

export async function currentUserId(page: Page): Promise<string> {
	const response = await page.request.get('/api/auth/me')
	expect(response.ok(), 'read current user').toBe(true)
	return ((await response.json()) as { user: { id: string } }).user.id
}

export async function createOwnTest(
	admin: Page,
	student: Page,
	options: { prefix: string; questions: OwnQuestion[]; timeLimitMinutes?: number }
): Promise<OwnTest> {
	const topics = await admin.request.get('/api/tests/topics')
	expect(topics.ok(), 'setup: read topics').toBe(true)
	const topic = ((await topics.json()) as { topics: { id: string; slug: string }[] }).topics.find(
		(item) => item.slug === TOPIC_SLUG
	)
	if (!topic) throw new Error(`setup: no topic ${TOPIC_SLUG}`)
	const suffix = Math.random().toString(36).slice(2, 8)
	const slug = `${options.prefix}-${suffix}`
	const title = `E2E ${options.prefix} ${suffix}`
	const saved = await admin.request.post('/api/tests/save', {
		data: {
			topicId: topic.id,
			title,
			slug,
			isPublished: true,
			showCorrectAnswer: true,
			timeLimitMinutes: options.timeLimitMinutes ?? null,
			questions: options.questions.map((question, order) => ({
				type: question.type ?? 'radio',
				order,
				points: 1,
				options: question.options ?? null,
				promptText: question.prompt,
				correct: question.correct,
			})),
		},
	})
	expect(saved.status(), `setup: create test ${slug}: ${await saved.text()}`).toBe(201)
	const id = ((await saved.json()) as { test: { id: string } }).test.id
	const assigned = await admin.request.post(`/api/tests/${id}/assignments`, {
		data: { userId: await currentUserId(student) },
	})
	expect(assigned.ok(), `setup: assign ${slug}: ${await assigned.text()}`).toBe(true)
	return { id, slug, title, topicSlug: TOPIC_SLUG }
}

export async function deleteOwnTest(admin: Page, test: OwnTest): Promise<void> {
	const response = await admin.request.delete(`/api/tests/${test.id}`)
	expect([200, 404], `cleanup: delete test ${test.slug}`).toContain(response.status())
}

export async function attemptIdsOf(page: Page, testId: string): Promise<string[]> {
	const response = await page.request.get(`/api/tests/public/tests/${testId}/attempts/me`)
	expect(response.ok(), 'read own attempts').toBe(true)
	return ((await response.json()) as { rows: { id: string }[] }).rows.map((row) => row.id)
}

export async function closeOpenSession(page: Page, testId: string): Promise<void> {
	const started = await page.request.post(`/api/tests/public/tests/${testId}/start`)
	if (!started.ok()) return
	const { sessionId } = (await started.json()) as { sessionId: string }
	const submitted = await page.request.post(`/api/tests/public/tests/${testId}/submit`, {
		data: { sessionId, clientAttemptId: crypto.randomUUID(), answers: {} },
	})
	expect(submitted.ok(), `cleanup: submit open session ${sessionId}`).toBe(true)
}

export function isSubmitRequest(url: string, method: string): boolean {
	return isSubmitResponse(url, method)
}
