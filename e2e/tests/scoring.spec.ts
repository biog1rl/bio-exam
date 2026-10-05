import { seedTopic } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const TYPE_KEY = 'short_answer'
const RENAMED = 'Ответ одним словом'

type ResolvedType = {
	key: string
	title: string
	override: { titleOverride: string | null; scoringRuleOverride: unknown; isDisabled: boolean } | null
}

test('a type renamed for one test keeps its name when the scoring page saves an own formula @scoring', async ({
	adminPage: page,
}, testInfo) => {
	const key = projectKey(testInfo)
	const topic = seedTopic(TOPIC_SLUG)
	const topicsResponse = await page.request.get('/api/tests/topics')
	expect(topicsResponse.ok(), 'read topics').toBe(true)
	const topicId = ((await topicsResponse.json()) as { topics: { id: string; slug: string }[] }).topics.find(
		(item) => item.slug === TOPIC_SLUG
	)?.id
	expect(topicId, 'seed topic id').toBeTruthy()

	const title = `Баллы ${key} ${Date.now()}`
	const slug = `scoring-${key}-${Date.now()}`
	const created = await page.request.post('/api/tests/save', { data: { topicId, title, slug, questions: [] } })
	expect(created.ok(), 'create a test for this check').toBe(true)
	const testId = ((await created.json()) as { test: { id: string } }).test.id

	try {
		await page.goto(`/admin/tests/question-types/${TYPE_KEY}`)
		await page.getByRole('combobox', { name: 'Тема', exact: true }).click()
		await page.getByRole('option', { name: topic.title, exact: true }).click()
		await page.getByRole('combobox', { name: 'Тест', exact: true }).click()
		await page.getByRole('option', { name: title, exact: true }).click()
		await page.getByLabel('Название в этом тесте').fill(RENAMED)
		await page.getByRole('button', { name: 'Сохранить для теста' }).click()
		await expect(page.getByText('Настройки типа для теста сохранены').first()).toBeVisible()
		expect(await lowContrastTexts(page), 'contrast of the type page').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the type page').toEqual([])

		await page.goto(`/admin/tests/scoring?scope=test&topicSlug=${TOPIC_SLUG}&testSlug=${slug}&type=${TYPE_KEY}`)
		await expect(page.getByText(RENAMED, { exact: true })).toBeVisible()
		await page.getByRole('switch', { name: /Своя формула для этого теста/ }).click()
		await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
		await expect(page.getByText('Формулы теста сохранены').first()).toBeVisible()
		expect(await lowContrastTexts(page), 'contrast of the scoring page').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the scoring page').toEqual([])

		const resolved = await page.request.get(`/api/tests/question-types?testId=${testId}&includeInactive=true`)
		expect(resolved.ok(), 'read types of the test').toBe(true)
		const type = ((await resolved.json()) as { questionTypes: ResolvedType[] }).questionTypes.find(
			(item) => item.key === TYPE_KEY
		)
		expect(type?.title).toBe(RENAMED)
		expect(type?.override?.titleOverride).toBe(RENAMED)
		expect(type?.override?.scoringRuleOverride).not.toBeNull()
	} finally {
		const deleted = await page.request.delete(`/api/tests/${testId}`)
		expect(deleted.ok(), 'remove the test of this check').toBe(true)
	}
})
