/**
 * D-14 flow 4: администратор создаёт вопросы каждого шаблона, который сегодня сохраняется,
 * в тесте authoring-<p> и видит их в списке вопросов после перезагрузки страницы.
 *
 * Тест authoring-<p> принадлежит только этим проверкам и только своему проекту, поэтому ни порядок
 * тестов, ни второй проект не видят изменённых данных.
 *
 * Формулировка вводится в редактор Lexical: его contenteditable имеет роль textbox и первым
 * стоит на странице, раньше полей ответа. Тексты формулировок короткие и без символов разметки
 * (# * _ ` [ ]), потому что карточка вопроса вырезает их из превью.
 */
import { type BrowserContext, type Locator, type Page } from '@playwright/test'

import { readFile } from 'node:fs/promises'

import { readZipEntries } from '../../app/server/src/test-support/zip'
import { seedTest, seedTopic } from '../fixtures/accounts'
import { openNewQuestionDraft } from '../fixtures/drafts'
import { expect, newSessionContext, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

type SavedQuestion = {
	id: string
	type: string
	promptText: string
	options: { id: string; text: string }[] | null
	matchingPairs: { left: { id: string }[]; right: { id: string }[] } | null
	correct: unknown
}

function testPageUrl(slug: string): string {
	return `/admin/tests/${TOPIC_SLUG}/${slug}`
}

/** Открывает форму нового вопроса кнопкой «Добавить вопрос» в редакторе теста */
async function openNewQuestion(page: Page, slug: string): Promise<void> {
	await openNewQuestionDraft(page, testPageUrl(slug))
	// Список типов приходит отдельным запросом: пока он пуст, селект типа заблокирован
	await expect(typeSelect(page)).toBeEnabled()
}

/** Селект «Тип вопроса»: первые combobox страницы принадлежат тулбару редактора формулировки (Paragraph, Heading) */
function typeSelect(page: Page): Locator {
	return page.getByText('Тип вопроса', { exact: true }).locator('xpath=..').getByRole('combobox')
}

async function selectType(page: Page, title: string): Promise<void> {
	await typeSelect(page).click()
	await page.getByRole('option', { name: title, exact: true }).click()
	await expect(typeSelect(page)).toContainText(title)
}

async function typePrompt(page: Page, prompt: string): Promise<void> {
	const editor = page.getByRole('textbox').first()
	await expect(editor).toHaveAttribute('contenteditable', 'true')
	await editor.click()
	await page.keyboard.type(prompt)
	await expect(editor).toContainText(prompt)
}

async function savedQuestions(page: Page, slug: string): Promise<SavedQuestion[]> {
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok()).toBe(true)
	return ((await response.json()) as { questions: SavedQuestion[] }).questions
}

/** Нажимает «Сохранить вопрос» и ждёт возврата на страницу теста */
async function saveQuestion(page: Page, slug: string): Promise<void> {
	await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
	await expect(page, 'saving a valid question returns to the test page').toHaveURL(
		new RegExp(`${testPageUrl(slug)}/?$`)
	)
}

type AuthoredQuestion = {
	template: string
	/** Название типа в селекте и в бейдже карточки; null — тип по умолчанию, выбирать не нужно */
	typeTitle: string | null
	prompt: string
	fill: (page: Page) => Promise<void>
	/** Проверка сохранённого ключа ответа по данным API */
	expectStored: (question: SavedQuestion) => void
}

const AUTHORED: AuthoredQuestion[] = [
	{
		template: 'single_choice',
		typeTitle: 'Один правильный вариант (legacy)',
		prompt: 'Автор e2e одиночный выбор',
		fill: async (page) => {
			await page.getByPlaceholder('Вариант 1', { exact: true }).fill('Первый вариант')
			await page.getByPlaceholder('Вариант 2', { exact: true }).fill('Второй вариант')
			// Тулбар редактора тоже содержит radio (выравнивание), поэтому радио берётся из строки варианта
			const correct = page.getByPlaceholder('Вариант 1', { exact: true }).locator('xpath=..').getByRole('radio')
			await correct.click()
			await expect(correct).toBeChecked()
		},
		expectStored: (question) => {
			expect(question.type).toBe('radio')
			expect(question.options?.map((option) => option.text)).toEqual(['Первый вариант', 'Второй вариант'])
			expect(question.correct).toBe(question.options?.[0].id)
		},
	},
	{
		template: 'multi_choice',
		typeTitle: 'Множественный выбор',
		prompt: 'Автор e2e множественный выбор',
		fill: async (page) => {
			await page.getByPlaceholder('Вариант 1', { exact: true }).fill('Первый вариант')
			await page.getByPlaceholder('Вариант 2', { exact: true }).fill('Второй вариант')
			for (const placeholder of ['Вариант 1', 'Вариант 2']) {
				const correct = page.getByPlaceholder(placeholder, { exact: true }).locator('xpath=..').getByRole('checkbox')
				await correct.click()
				await expect(correct).toBeChecked()
			}
		},
		expectStored: (question) => {
			expect(question.type).toBe('checkbox')
			expect(question.correct).toEqual(question.options?.map((option) => option.id))
		},
	},
	{
		template: 'matching',
		typeTitle: 'Сопоставление',
		prompt: 'Автор e2e сопоставление',
		fill: async (page) => {
			await page.getByPlaceholder('Элемент 1', { exact: true }).fill('Левый один')
			await page.getByPlaceholder('Элемент 2', { exact: true }).fill('Левый два')
			await page.getByPlaceholder('Соответствие A', { exact: true }).fill('Правый один')
			await page.getByPlaceholder('Соответствие B', { exact: true }).fill('Правый два')
			// Правильные соответствия: строка «N. подпись» и select справа от неё в одном контейнере
			for (const [index, right] of ['A. Правый один', 'B. Правый два'].entries()) {
				const left = ['1. Левый один', '2. Левый два'][index]
				const select = page.getByText(left, { exact: true }).locator('xpath=..').getByRole('combobox')
				await select.click()
				await page.getByRole('option', { name: right, exact: true }).click()
				await expect(select).toContainText(right)
			}
		},
		expectStored: (question) => {
			expect(question.type).toBe('matching')
			const pairs = question.matchingPairs
			expect(pairs?.left).toHaveLength(2)
			expect(question.correct).toEqual({
				[pairs!.left[0].id]: pairs!.right[0].id,
				[pairs!.left[1].id]: pairs!.right[1].id,
			})
		},
	},
	{
		template: 'sequence_digits',
		typeTitle: 'Правильная последовательность',
		prompt: 'Автор e2e последовательность',
		fill: async (page) => {
			await page.getByPlaceholder('Например: 2314').fill('3142')
		},
		expectStored: (question) => {
			expect(question.type).toBe('sequence')
			// Ключ из одних цифр сервер хранит числом (JSONB), поэтому сравнивается строковая запись
			expect(String(question.correct)).toBe('3142')
		},
	},
	{
		template: 'short_text',
		typeTitle: null,
		prompt: 'Автор e2e краткий ответ',
		fill: async (page) => {
			await page.getByPlaceholder('Введите правильный ответ').fill('митоз')
		},
		expectStored: (question) => {
			expect(question.type).toBe('short_answer')
			expect(question.correct).toBe('митоз')
		},
	},
]

test.describe.serial('flow 4: question authoring', () => {
	for (const authored of AUTHORED) {
		test(`admin creates a ${authored.template} question and finds it after reload @flow4`, async ({
			adminPage: page,
		}, testInfo) => {
			const slug = seedTest(projectKey(testInfo), 'authoring').slug

			await openNewQuestion(page, slug)
			if (authored.typeTitle) await selectType(page, authored.typeTitle)
			await typePrompt(page, authored.prompt)
			await authored.fill(page)
			await saveQuestion(page, slug)

			// Перезагрузка: вопрос приходит с сервера, а не из состояния страницы
			await page.reload()
			await expect(page.getByText(authored.prompt)).toBeVisible()
			if (authored.typeTitle) {
				await expect(
					page.getByText(authored.typeTitle, { exact: true }).filter({ visible: true }).first()
				).toBeVisible()
			}

			const stored = (await savedQuestions(page, slug)).find((question) =>
				question.promptText.includes(authored.prompt)
			)
			expect(stored, `question "${authored.prompt}" is stored for the test`).toBeDefined()
			authored.expectStored(stored!)
		})
	}
})

const D5_PROMPT = 'Автор e2e несколько вариантов'

test.describe.serial('D5: short answer with several accepted variants', () => {
	let admin: BrowserContext | undefined
	let page: Page | undefined
	let slug = ''

	// Подготовка: форма нового вопроса, тип «несколько вариантов», формулировка и два варианта.
	test('D5 setup: admin opens a new question and fills the variants type', async ({ browser }, testInfo) => {
		slug = seedTest(projectKey(testInfo), 'authoring').slug
		admin = await newSessionContext(browser, testInfo, 'admin')
		page = await admin.newPage()

		await openNewQuestion(page, slug)
		await selectType(page, 'Краткий ответ (несколько вариантов)')
		await typePrompt(page, D5_PROMPT)
		await page.getByLabel('Вариант 1', { exact: true }).fill('эксперимент')
		await page.getByLabel('Вариант 2', { exact: true }).fill('моделирование')
		await expect(page.getByLabel('Вариант 2', { exact: true })).toHaveValue('моделирование')
	})

	test.afterAll(async () => {
		await admin?.close()
	})

	test('D5: a short answer with two accepted variants saves', async () => {
		await saveQuestion(page!, slug)
		await page!.reload()
		await expect(page!.getByText(D5_PROMPT), 'the saved question appears in the list after reload').toBeVisible()

		const stored = (await savedQuestions(page!, slug)).find((question) => question.promptText.includes(D5_PROMPT))
		expect(stored, `question "${D5_PROMPT}" is stored for the test`).toBeDefined()
		expect(stored!.type).toBe('short_answer_variants')
		expect(stored!.correct).toEqual(['эксперимент', 'моделирование'])

		await page!.goto(`${testPageUrl(slug)}/questions/${stored!.id}`)
		await expect(page!.getByLabel('Вариант 1', { exact: true })).toHaveValue('эксперимент')
		await expect(page!.getByLabel('Вариант 2', { exact: true })).toHaveValue('моделирование')
	})
})

test.describe.serial('D-34: test export', () => {
	for (const withAnswers of [false, true]) {
		test(`admin exports the test ${withAnswers ? 'with' : 'without'} answer keys`, async ({
			adminPage: page,
		}, testInfo) => {
			const seeded = seedTest(projectKey(testInfo), 'authoring')
			const questions = await savedQuestions(page, seeded.slug)

			await page.goto(testPageUrl(seeded.slug))
			await expect(page.getByRole('heading', { level: 1, name: seeded.title })).toBeVisible()
			await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
			const downloaded = page.waitForEvent('download')
			await page.getByRole('menuitem', { name: withAnswers ? 'С ответами' : 'Без ответов', exact: true }).click()
			const download = await downloaded

			expect(download.suggestedFilename()).toBe(`${TOPIC_SLUG}-${seeded.slug}.zip`)
			const names = [...readZipEntries(await readFile(await download.path())).keys()]
			expect(names).toContain('settings.json')
			for (const question of questions) expect(names).toContain(`questions/${question.id}/prompt.md`)
			expect(names.includes('answer_keys.json')).toBe(withAnswers)
		})
	}
})

test('admin creating a test with an address already taken in the topic sees the error at the address field', async ({
	adminPage: page,
}, testInfo) => {
	const taken = seedTest(projectKey(testInfo), 'authoring')

	await page.goto('/admin/tests/new')
	const topicSelect = page.getByText('Тема', { exact: true }).locator('xpath=..').getByRole('combobox')
	await expect(topicSelect).toBeEnabled()
	await topicSelect.click()
	await page.getByRole('option', { name: seedTopic(TOPIC_SLUG).title, exact: true }).click()

	await page.getByPlaceholder('Тест по теме...').fill('Повтор адреса')
	await page.getByPlaceholder('test-slug').fill(taken.slug)
	await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click()

	await expect(page.getByText('Тест с таким адресом уже есть в этой теме', { exact: true })).toBeVisible()
	await expect(page.getByText('Ошибка сохранения', { exact: true })).toHaveCount(0)
	await expect(page).toHaveURL(/\/admin\/tests\/new\/?$/)
})
