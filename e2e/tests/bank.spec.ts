import { seedTest, seedTopic } from '../fixtures/accounts'
import { bankTopicTitles, openBankTopic } from '../fixtures/bank'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

test.describe('question bank: topics on the side, tests in one table', () => {
	test('filters and sort live in the address and survive a reload @bank', async ({ adminPage: page }, testInfo) => {
		const seeded = seedTest(projectKey(testInfo), 'all-templates')
		await page.goto('/admin/tests')
		await expect(page.getByRole('heading', { level: 1, name: 'Банк заданий' })).toBeVisible()
		await expect(page.getByRole('link', { name: seeded.title, exact: true })).toBeVisible()
		expect(await bankTopicTitles(page)).toContain('Все тесты')

		const statusFilter = page.getByRole('button', { name: 'Фильтр по статусу' })
		await statusFilter.click()
		await page.getByRole('menuitemcheckbox', { name: /^Черновик/ }).click()
		await expect(page.getByRole('menuitemcheckbox', { name: /^Черновик/ })).toHaveAttribute('aria-checked', 'true')
		await page.keyboard.press('Escape')
		await expect(page).toHaveURL(/\/admin\/tests\?status=draft$/)
		for (const label of await page
			.getByRole('row')
			.filter({ has: page.getByRole('link') })
			.allInnerTexts()) {
			expect(label).toContain('Черновик')
		}
		expect(await lowContrastTexts(page), 'contrast with the status filter').toEqual([])

		await statusFilter.click()
		await page.getByRole('menuitem', { name: 'Сбросить' }).click()
		await expect(page).toHaveURL(/\/admin\/tests$/)
		await page.getByRole('searchbox', { name: 'Поиск тестов' }).fill(seeded.title)
		await expect(page.getByRole('link', { name: seeded.title, exact: true })).toBeVisible()
		await expect(page.getByText(/^Показано \d+ из \d+$/)).toBeVisible()

		const titleHead = page.getByRole('columnheader', { name: 'Название' })
		await titleHead.getByRole('button').click()
		await expect(titleHead).toHaveAttribute('aria-sort', 'ascending')
		await page.reload()
		await expect(page.getByRole('searchbox', { name: 'Поиск тестов' })).toHaveValue(seeded.title)
		await expect(page.getByRole('columnheader', { name: 'Название' })).toHaveAttribute('aria-sort', 'ascending')

		await page.getByRole('searchbox', { name: 'Поиск тестов' }).fill('нет такого теста')
		await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(page.getByRole('link', { name: seeded.title, exact: true })).toBeVisible()

		expect(await lowContrastTexts(page), 'contrast of the bank').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the bank').toEqual([])

		await page
			.getByRole('row')
			.filter({ has: page.getByRole('link', { name: seeded.title, exact: true }) })
			.click({ position: { x: 6, y: 6 } })
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}/${seeded.slug}$`))
	})

	test('a topic opens in the same layout with its own actions @bank', async ({ adminPage: page }, testInfo) => {
		const topic = seedTopic(TOPIC_SLUG)
		const seeded = seedTest(projectKey(testInfo), 'all-templates')
		await page.goto('/admin/tests')
		await expect(page.getByRole('link', { name: seeded.title, exact: true })).toBeVisible()

		await openBankTopic(page, topic.title)
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}$`))
		await expect(page.getByRole('heading', { level: 1, name: topic.title })).toBeVisible()
		await expect(page.getByRole('link', { name: seeded.title, exact: true })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Новый тест' })).toHaveAttribute(
			'href',
			`/admin/tests/new?topic=${TOPIC_SLUG}`
		)
		await page.getByRole('button', { name: 'Действия с темой' }).click()
		await expect(page.getByRole('menuitem', { name: 'Изменить тему' })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: 'Экспорт с ответами' })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: 'Удалить тему' })).toBeVisible()
		await page.keyboard.press('Escape')

		await page.getByRole('button', { name: `Действия с тестом ${seeded.title}` }).click()
		await expect(page.getByRole('menuitem', { name: 'Открыть редактор' })).toBeVisible()
		await page.keyboard.press('Escape')

		expect(await lowContrastTexts(page), 'contrast of the topic').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the topic').toEqual([])
	})
})
