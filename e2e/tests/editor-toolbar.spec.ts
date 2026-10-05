import { type Locator, type Page } from '@playwright/test'

import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

type ControlList = { toolbar: string[]; actions: string[] }

const FULL_CONTROLS: ControlList = {
	toolbar: [
		'button:Undo',
		'button:Redo',
		'combobox:[Paragraph]',
		'combobox:[Arial]',
		'button:[lucide-minus]',
		'button:16',
		'button:[lucide-plus]',
		'button:1.5',
		'button:Bold',
		'button:Italic',
		'button:Underline',
		'button:Strikethrough',
		'radio:Toggle subscript',
		'radio:Toggle superscript',
		'button:Toggle link',
		'button:Clear formatting',
		'button:text color',
		'button:text background color',
		'radio:Left Align',
		'radio:Center Align',
		'radio:Right Align',
		'radio:Justify Align',
		'radio:Outdent',
		'radio:Indent',
		'combobox:[Insert]',
		'button:Медиатека',
	],
	actions: [
		'button:Disable speech to text',
		'button:Share Playground link to current editor state',
		'button:Import editor state from JSON',
		'button:Export editor state to JSON',
		'button:Convert from markdown',
		'button:Lock read-only mode',
		'button:[lucide-trash2]',
		'button:[lucide-notebook-pen]',
	],
}

const TRACE_TEXT = 'trace text'
const TRACE_PROMPT = 'trace text'
const PLAIN_WORD = 'обычный'
const BOLD_WORD = 'жирный'

type DraftPayload = { question?: { promptText?: string }; promptText?: string }

type BySlug = { test: { id: string }; questions: { id: string; promptText: string }[] }

function testPageUrl(slug: string): string {
	return `/admin/tests/${TOPIC_SLUG}/${slug}`
}

function promptEditor(page: Page): Locator {
	return page.getByRole('textbox').first()
}

function editorFrame(page: Page): Locator {
	return promptEditor(page).locator(
		'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " shadow ")][1]'
	)
}

function suggestion(page: Page): Locator {
	return promptEditor(page).locator('span.text-muted-foreground')
}

async function bySlug(page: Page, slug: string): Promise<BySlug> {
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok(), `read test ${slug}`).toBe(true)
	return (await response.json()) as BySlug
}

async function controlNames(scope: Locator): Promise<string[]> {
	const names: string[] = []
	for (const control of await scope.locator('button').all()) {
		const match = /^- '?(\w+)(?: "((?:[^"\\]|\\.)*)")?/.exec(await control.ariaSnapshot())
		if (!match) continue
		const name = match[2] === undefined ? '' : (JSON.parse(`"${match[2]}"`) as string)
		if (name) {
			names.push(`${match[1]}:${name}`)
			continue
		}
		const hint = await control.evaluate(
			(element) =>
				element.textContent?.trim() ||
				/lucide-[a-z0-9-]+/.exec(element.querySelector('svg')?.getAttribute('class') ?? '')?.[0] ||
				''
		)
		names.push(`${match[1]}:[${hint}]`)
	}
	return names
}

async function waitForSuggestion(page: Page): Promise<boolean> {
	return suggestion(page)
		.first()
		.waitFor({ state: 'attached', timeout: 5000 })
		.then(() => true)
		.catch(() => false)
}

async function openEditPage(page: Page, slug: string): Promise<{ testId: string; questionId: string }> {
	const data = await bySlug(page, slug)
	const questionId = data.questions[0]?.id
	if (!questionId) throw new Error(`setup: no question in ${slug}`)
	await page.goto(`${testPageUrl(slug)}/questions/${questionId}`)
	await expect(page.getByRole('heading', { level: 1, name: 'Редактирование' })).toBeVisible()
	await expect(promptEditor(page)).toHaveAttribute('contenteditable', 'true')
	return { testId: data.test.id, questionId }
}

test.describe.configure({ mode: 'serial' })

test.describe('редактор формулировки: пресет full', () => {
	test('набор тулбара full', async ({ adminPage: page }, testInfo) => {
		const key = projectKey(testInfo)
		await openEditPage(page, seedTest(key, 'editor').slug)
		const frame = editorFrame(page)
		const toolbar = frame.locator('div.sticky').first()
		const actions = frame.locator('div.clear-both').first()
		await expect(toolbar.getByRole('button').first()).toBeVisible()
		await expect
			.poll(async () => ({ toolbar: await controlNames(toolbar), actions: await controlNames(actions) }), {
				timeout: 15_000,
			})
			.toEqual(FULL_CONTROLS)
	})

	test('promptText сохранённого вопроса', async ({ adminPage: page }, testInfo) => {
		const slug = seedTest(projectKey(testInfo), 'editor').slug
		const { questionId } = await openEditPage(page, slug)
		await promptEditor(page).click()
		await page.keyboard.press('ControlOrMeta+a')
		await page.keyboard.press('Backspace')
		await page.keyboard.type(TRACE_TEXT)
		await expect(promptEditor(page)).toContainText(TRACE_TEXT)
		const suggested = await waitForSuggestion(page)
		testInfo.annotations.push({ type: 'suggestion', description: String(suggested) })
		await page.getByRole('button', { name: 'Сохранить вопрос' }).click()
		await expect(page).toHaveURL(new RegExp(`${testPageUrl(slug)}/?$`))
		const saved = (await bySlug(page, slug)).questions.find((question) => question.id === questionId)
		expect(saved?.promptText).toBe(TRACE_PROMPT)
	})

	test('promptText черновика', async ({ adminPage: page }, testInfo) => {
		const slug = seedTest(projectKey(testInfo), 'editor').slug
		const testId = (await bySlug(page, slug)).test.id
		await page.goto(`${testPageUrl(slug)}/questions/new`)
		await expect(page).toHaveURL(new RegExp(`${testPageUrl(slug)}/questions/drafts/[0-9a-f-]+$`))
		await expect(page.getByRole('heading', { level: 1, name: 'Новый вопрос' })).toBeVisible()
		await expect(promptEditor(page)).toHaveAttribute('contenteditable', 'true')
		const draftId = /\/questions\/drafts\/([0-9a-f-]+)$/.exec(new URL(page.url()).pathname)?.[1]
		if (!draftId) throw new Error(`setup: no draft id in ${page.url()}`)
		try {
			const saved = page.waitForResponse(
				(response) =>
					response.request().method() === 'PATCH' &&
					response.url().includes(draftId) &&
					(response.request().postData() ?? '').includes(TRACE_TEXT) &&
					response.status() === 200
			)
			await promptEditor(page).click()
			await page.keyboard.type(TRACE_TEXT)
			const suggested = await waitForSuggestion(page)
			testInfo.annotations.push({ type: 'suggestion', description: String(suggested) })
			await saved
			const response = await page.request.get(`/api/tests/${testId}/question-drafts/${draftId}`)
			expect(response.ok(), `read draft ${draftId}`).toBe(true)
			const { draft } = (await response.json()) as { draft: { payload: DraftPayload } }
			const promptText = draft.payload.question?.promptText ?? draft.payload.promptText
			expect(promptText).toBe(TRACE_PROMPT)
		} finally {
			const deleted = await page.request.delete(`/api/tests/${testId}/question-drafts/${draftId}`)
			expect([200, 404], `cleanup: delete draft ${draftId}`).toContain(deleted.status())
		}
	})

	test('состояние кнопки форматирования следует выделению', async ({ adminPage: page }, testInfo) => {
		await openEditPage(page, seedTest(projectKey(testInfo), 'editor').slug)
		const editor = promptEditor(page)
		const bold = editorFrame(page).locator('div.sticky').first().getByRole('button', { name: 'Bold', exact: true })
		await editor.click()
		await page.keyboard.press('ControlOrMeta+a')
		await page.keyboard.press('Backspace')
		await page.keyboard.type(`${PLAIN_WORD} ${BOLD_WORD}`)
		await expect(editor).toContainText(`${PLAIN_WORD} ${BOLD_WORD}`)
		for (let index = 0; index < BOLD_WORD.length; index++) await page.keyboard.press('Shift+ArrowLeft')
		await expect(bold).toHaveAttribute('aria-pressed', 'false')
		await bold.click()
		const boldText = editor.locator('strong, b').filter({ hasText: BOLD_WORD })
		await expect(boldText).toHaveCount(1)
		await expect(bold).toHaveAttribute('aria-pressed', 'true')
		await editor.getByText(PLAIN_WORD, { exact: true }).click()
		await expect(bold).toHaveAttribute('aria-pressed', 'false')
		await boldText.click()
		await expect(bold).toHaveAttribute('aria-pressed', 'true')
		await editor.getByText(PLAIN_WORD, { exact: true }).click()
		await expect(bold).toHaveAttribute('aria-pressed', 'false')
	})
})
