/**
 * D-14 flow 3: разбор отправленной попытки студентом и администратором, плюс известный дефект
 * D1 как ожидаемое падение (test.fail).
 *
 * Отдельной страницы разбора для студента в приложении нет: разбор по вопросам студент видит
 * в TestRunner сразу после отправки (кнопки номеров вопросов остаются активными). Администратор
 * открывает ту же попытку на /admin/attempts/<id>.
 *
 * Известный дефект D1 (D-14), сценарий в test.describe.serial:
 * - вся подготовка (прохождение, чтение разбора, правка ключа) идёт в обычном тесте `setup`,
 *   первом в блоке. test.fail() засчитывает любое падение как ожидаемое, в том числе ошибку
 *   хука beforeAll (проверено пробой: ошибка в beforeAll у test.fail остаётся «ожидаемой»), а
 *   упавший обычный тест красный всегда. Сломанный вход, старт, отправка или загрузка разбора
 *   поэтому валят прогон, а не растворяются в дефекте. После упавшего setup следующий
 *   test.fail тест не запускается (serial);
 * - в помеченной test.fail проверке остаётся одно утверждение о правильном поведении, и только
 *   оно, как сказано в комментарии над проверкой, ожидаемо падает сегодня.
 */
import { type BrowserContext, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import {
	adminReviewSections,
	correctAnswers,
	expect,
	newSessionContext,
	projectKey,
	takeTest,
	test,
	totalPointsOf,
	TOPIC_SLUG,
	type AnswerValue,
} from '../fixtures/exam'

type ExpectedQuestion = {
	/** Ключ вопроса в сиде */
	key: string
	answer: AnswerValue
	/** Подпись статуса: в TestRunner и на странице администратора они различаются у «частично» */
	studentStatus: string
	adminStatus: string
	earned: number
	points: number
	/** Фрагменты разбора ответа, одинаковые у студента и администратора */
	shows: string[]
}

/**
 * Смешанная попытка: верно, частично, неверно, верно, верно. Баллы 1 + 1 + 0 + 1 + 2 = 5 из 8.
 * Множественный выбор: отмечен 1 из 2 верных, одна ошибка по метрике set_distance, значит 1 из 2.
 * Сопоставление: две пары перепутаны, две ошибки, значит 0 из 2.
 */
const MIXED: ExpectedQuestion[] = [
	{
		key: 'single-choice',
		answer: '2',
		studentStatus: 'Верно',
		adminStatus: 'Верно',
		earned: 1,
		points: 1,
		shows: ['Митохондрия', 'Выбран · верно'],
	},
	{
		key: 'multi-choice',
		answer: ['1'],
		studentStatus: 'Частично верно',
		adminStatus: 'Частично',
		earned: 1,
		points: 2,
		shows: ['Выбрано: 1', 'пропущено верных: 1', 'Верный ответ · пропущен'],
	},
	{
		key: 'matching',
		answer: { a: '1', b: '3', c: '2' },
		studentStatus: 'Неверно',
		adminStatus: 'Неверно',
		earned: 0,
		points: 2,
		shows: [
			'Фотосинтез → Хлоропласт',
			'Синтез белка → Митохондрия',
			'Клеточное дыхание → Рибосома',
			'Верных пар: 1 / 3',
			'Неверно · правильная пара: Рибосома',
		],
	},
	{
		key: 'short-text',
		answer: 'митоз',
		studentStatus: 'Верно',
		adminStatus: 'Верно',
		earned: 1,
		points: 1,
		shows: ['Ответ студента · верно', 'митоз'],
	},
	{
		key: 'sequence-digits',
		answer: '2314',
		studentStatus: 'Верно',
		adminStatus: 'Верно',
		earned: 2,
		points: 2,
		shows: ['Ответ студента · верно', '2314', 'Ошибок: 0'],
	},
]

const MIXED_EARNED = MIXED.reduce((sum, item) => sum + item.earned, 0)
const MIXED_POINTS = MIXED.reduce((sum, item) => sum + item.points, 0)

test.describe.serial('flow 3: review of a submitted attempt', () => {
	// Id попытки передаётся из теста студента в тест администратора; воркер один на проект
	let attemptId = ''

	test('student reviews every question of the submitted attempt @flow3', async ({ studentPage: page }, testInfo) => {
		const allTemplates = seedTest(projectKey(testInfo), 'all-templates')
		expect(MIXED.map((item) => item.key)).toEqual(allTemplates.questions.map((question) => question.key))
		expect(MIXED_POINTS).toBe(totalPointsOf(allTemplates))

		const answers = Object.fromEntries(MIXED.map((item) => [item.key, item.answer]))
		const submitted = await takeTest(page, allTemplates, answers)
		attemptId = submitted.attemptId
		expect(submitted.earnedPoints).toBe(MIXED_EARNED)

		await expect(page.getByText(`Баллы: ${MIXED_EARNED} / ${MIXED_POINTS}`)).toBeVisible()
		await expect(page.getByText('Процент: 63%')).toBeVisible()
		await expect(page.getByText('Статус: пройден')).toBeVisible()

		// Разбор по вопросам: после отправки номера вопросов остаются кнопками, а «Назад» и «Далее» заблокированы
		const section = page.locator('section[id^="question-"]')
		for (const [index, expected] of MIXED.entries()) {
			await page.getByRole('button', { name: String(index + 1), exact: true }).click()
			await expect(page.getByText(`${index + 1}.`, { exact: true })).toBeVisible()
			await expect(section.getByText(expected.studentStatus, { exact: true }).first()).toBeVisible()
			await expect(section.getByText(`${expected.earned} / ${expected.points} баллов`, { exact: true })).toBeVisible()
			for (const snippet of expected.shows) {
				await expect(section).toContainText(snippet)
			}
		}
	})

	test('admin sees the same answers and scores under /admin/attempts/<id> @flow3', async ({
		adminPage: page,
	}, testInfo) => {
		expect(attemptId, 'the student test above must have produced an attempt').not.toBe('')
		const allTemplates = seedTest(projectKey(testInfo), 'all-templates')
		const sections = await adminReviewSections(page, attemptId, allTemplates.questions.length)
		expect(sections).toHaveLength(MIXED.length)

		await expect(page.getByText(`${MIXED_EARNED}/${MIXED_POINTS}`, { exact: true })).toBeVisible()
		await expect(page.getByText('63%', { exact: true })).toBeVisible()
		await expect(page.getByText('порог пройден')).toBeVisible()

		for (const [index, expected] of MIXED.entries()) {
			const section = page.locator(`#question-${index}`)
			await expect(section.getByText(expected.adminStatus, { exact: true })).toBeVisible()
			await expect(section.getByText(`${expected.earned} / ${expected.points} балл.`, { exact: true })).toBeVisible()
			for (const snippet of expected.shows) {
				await expect(section).toContainText(snippet)
			}
		}
	})
})

function mistakesInReview(sectionText: string): number {
	const found = /Ошибок: (\d+)/.exec(sectionText)
	if (!found) throw new Error(`no "Ошибок: N" line in the review: ${sectionText}`)
	return Number(found[1])
}

/**
 * Число ошибок, которое сервер засчитал за вопрос-последовательность. Сервер не хранит число ошибок,
 * только баллы: правило sequence — one_mistake_partial, 2 балла за 0 ошибок, 1 балл за 1 ошибку, 0 за две и больше.
 */
function serverMistakesFromPoints(earnedPoints: number, maxPoints: number): number {
	if (earnedPoints >= maxPoints) return 0
	if (earnedPoints > 0) return 1
	return 2
}

test.describe.serial('D2: two sequence error counts', () => {
	let student: BrowserContext | undefined
	let admin: BrowserContext | undefined
	let mistakesShownInReview = -1
	let serverMistakes = -1

	// Подготовка: ответ 1234 на ключ 1243, затем оба числа читаются из разбора и из API.
	test('D2 setup: student answers 1234 on key 1243 and both error counts are read', async ({ browser }, testInfo) => {
		const sequenceTest = seedTest(projectKey(testInfo), 'seq-d2')
		const question = sequenceTest.questions[0]
		expect(question.correct).toBe('1243')

		student = await newSessionContext(browser, testInfo, 'user')
		const studentPage = await student.newPage()
		const submitted = await takeTest(studentPage, sequenceTest, { [question.key]: '1234' })
		expect(submitted.results).toHaveLength(1)

		admin = await newSessionContext(browser, testInfo, 'admin')
		const sections = await adminReviewSections(await admin.newPage(), submitted.attemptId, 1)
		mistakesShownInReview = mistakesInReview(sections[0])
		expect(sections[0]).toContain('Соседняя перестановка считается одной ошибкой.')

		// Баллы попытки читаются отдельным запросом студента, а не из ответа отправки
		const testId = (
			await (await studentPage.request.get(`/api/tests/public/topics/${TOPIC_SLUG}/tests/${sequenceTest.slug}`)).json()
		).test.id as string
		const attempts = await studentPage.request.get(`/api/tests/public/tests/${testId}/attempts/me`)
		expect(attempts.ok()).toBe(true)
		const rows = ((await attempts.json()) as { rows: { id: string; earnedPoints: number; totalPoints: number }[] }).rows
		const row = rows.find((item) => item.id === submitted.attemptId)
		expect(row, 'the attempt is listed for the student').toBeDefined()
		serverMistakes = serverMistakesFromPoints(row!.earnedPoints, row!.totalPoints)
	})

	test.afterAll(async () => {
		await student?.close()
		await admin?.close()
	})

	test('D2: review error count equals the server error count', () => {
		expect(
			mistakesShownInReview,
			'mistakes shown in review must equal the mistakes the server scored for 1234 vs 1243'
		).toBe(serverMistakes)
	})
})

test.describe.serial('known defect D1: admin review follows the current answer key', () => {
	let student: BrowserContext | undefined
	let admin: BrowserContext | undefined
	let adminPage: Page | undefined
	let attemptId = ''
	let before: string[] = []

	// Подготовка (обычный тест, сбой красный): правильная попытка студента, разбор администратора до правки,
	// правка ключа. Правильный ответ нужен намеренно: сервер хранит correctAnswer в результате только у неверных
	// ответов, а у верных разбор администратора подставляет ТЕКУЩИЙ ключ, поэтому правка ключа меняет
	// разбор старой попытки.
	test('D1 setup: student answers correctly, admin records the review and corrects the key @known-defect', async ({
		browser,
	}, testInfo) => {
		const reviewTest = seedTest(projectKey(testInfo), 'review-d1')
		const radio = reviewTest.questions[0]
		expect(radio.template).toBe('single_choice')
		expect(radio.correct).toBe('2')

		student = await newSessionContext(browser, testInfo, 'user')
		const submitted = await takeTest(await student.newPage(), reviewTest, correctAnswers(reviewTest))
		expect(submitted.earnedPoints).toBe(totalPointsOf(reviewTest))
		attemptId = submitted.attemptId

		admin = await newSessionContext(browser, testInfo, 'admin')
		adminPage = await admin.newPage()
		before = await adminReviewSections(adminPage, attemptId, reviewTest.questions.length)
		// Базовая линия: ключ ещё прежний, пропущенных верных вариантов нет
		expect(before[0]).toContain('Выбран · верно')
		expect(before[0]).not.toContain('пропущен')

		// Админ исправляет ключ вопроса тем же запросом, что и редактор вопроса: PATCH /api/tests/:id/questions/:id
		const detailUrl = `/api/tests/by-slug/${TOPIC_SLUG}/${reviewTest.slug}`
		const detail = await adminPage.request.get(detailUrl)
		expect(detail.ok()).toBe(true)
		const detailBody = (await detail.json()) as {
			test: { id: string }
			questions: {
				id: string
				type: string
				order: number
				points: number
				options: unknown
				matchingPairs: unknown
				promptText: string
				explanationText: string | null
				correct: unknown
			}[]
		}
		const target = detailBody.questions.find((item) => item.order === 0)
		expect(target, 'first question of the review-d1 test').toBeDefined()
		const patched = await adminPage.request.patch(`/api/tests/${detailBody.test.id}/questions/${target!.id}`, {
			data: {
				type: target!.type,
				order: target!.order,
				points: target!.points,
				options: target!.options,
				matchingPairs: target!.matchingPairs,
				promptText: target!.promptText,
				explanationText: target!.explanationText || null,
				correct: '1',
			},
		})
		expect(patched.ok(), `answer key PATCH status ${patched.status()}`).toBe(true)
		const reread = (await (await adminPage.request.get(detailUrl)).json()) as typeof detailBody
		// Сервер хранит однозначный числовой ключ числом: JSONB отдаёт 1, а не "1"
		expect(String(reread.questions.find((item) => item.id === target!.id)?.correct)).toBe('1')
	})

	test.afterAll(async () => {
		await student?.close()
		await admin?.close()
	})

	// Ожидаемо падает единственное утверждение ниже: после исправления ключа разбор старой попытки
	// у администратора меняется (у варианта «Углекислый газ» появляется «Верный ответ · пропущен»),
	// хотя попытка уже оценена и должна читаться с ключом, действовавшим при сдаче.
	test.fail(
		'D1 — fixed in Phase 5 (SCORE-03): admin review of an earlier attempt is unchanged @known-defect',
		async () => {
			const reviewTest = seedTest(projectKey(test.info()), 'review-d1')
			const after = await adminReviewSections(adminPage!, attemptId, reviewTest.questions.length)
			expect(after, 'admin review of an earlier attempt after the answer key was corrected').toEqual(before)
		}
	)
})
