import { type Page, type Response } from '@playwright/test'

import { EMOJI_MARKER } from '../../scripts/editor-bundle.mjs'
import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

type BySlug = { test: { id: string }; questions: { id: string; promptText: string }[] }

type ScriptLog = { urls: string[]; withMarker: string[]; pending: Set<Promise<void>> }

async function scriptBody(response: Response): Promise<Buffer> {
	return response.body().catch(() => Buffer.alloc(0))
}

function isScript(response: Response): boolean {
	return response.request().resourceType() === 'script'
}

function watchScripts(page: Page): ScriptLog {
	const log: ScriptLog = { urls: [], withMarker: [], pending: new Set() }
	page.on('response', (response) => {
		if (!isScript(response)) return
		log.urls.push(response.url())
		const read = scriptBody(response).then((body) => {
			if (body.includes(EMOJI_MARKER)) log.withMarker.push(response.url())
		})
		log.pending.add(read)
		void read.finally(() => log.pending.delete(read))
	})
	return log
}

async function settled(log: ScriptLog): Promise<void> {
	while (log.pending.size > 0) await Promise.all([...log.pending])
}

test('таблица эмодзи не грузится при открытии редактора и грузится по вводу двоеточия', async ({
	adminPage: page,
}, testInfo) => {
	const slug = seedTest(projectKey(testInfo), 'editor').slug
	const response = await page.request.get(`/api/tests/by-slug/${TOPIC_SLUG}/${slug}`)
	expect(response.ok(), `read test ${slug}`).toBe(true)
	const question = ((await response.json()) as BySlug).questions[0]
	if (!question) throw new Error(`setup: no question in ${slug}`)
	expect(question.promptText).not.toMatch(/:[a-z0-9_]+:/)

	const log = watchScripts(page)
	await page.goto(`/admin/tests/${TOPIC_SLUG}/${slug}/questions/${question.id}`)
	await expect(page.getByRole('heading', { level: 1, name: /^Вопрос \d+$/ })).toBeVisible()
	const editor = page.getByRole('textbox').first()
	await expect(editor).toHaveAttribute('contenteditable', 'true')
	await expect(editor).toContainText(question.promptText)
	await page.waitForLoadState('networkidle')
	await settled(log)
	expect(log.urls.length).toBeGreaterThan(0)
	expect(log.withMarker).toEqual([])

	const emojiChunk = page.waitForResponse(
		async (candidate) => isScript(candidate) && (await scriptBody(candidate)).includes(EMOJI_MARKER)
	)
	await editor.click()
	await page.keyboard.press('ControlOrMeta+a')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.type(' :smi')
	await emojiChunk
	await expect(page.getByRole('option', { name: /\ssmile$/ })).toBeVisible()
	await expect(editor).toContainText(`${question.promptText} :smi`)
})
