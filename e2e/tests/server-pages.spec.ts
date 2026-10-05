import { seedTest } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'

const ERROR_HEADING = 'Не удалось загрузить страницу'

test.describe('server pages reach Express through one request path', () => {
	test('admin opens the attempts list without the error page', async ({ adminPage: page }) => {
		await page.goto('/admin/attempts')
		await expect(page.getByRole('heading', { level: 1, name: 'Попытки студентов' })).toBeVisible()
		await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
	})

	test('an attempt the API rejects shows the error page with retry and home', async ({ adminPage: page }) => {
		await page.goto('/admin/attempts/not-a-uuid')
		const heading = page.getByRole('heading', { level: 1, name: ERROR_HEADING })
		await expect(heading).toBeVisible()
		await expect(heading).toBeFocused()
		await expect(page.getByText('ошибка', { exact: true })).toBeVisible()
		await expect(page.getByText('Код ошибки:')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'На главную' })).toBeVisible()
		await expect(page.getByText('Something went wrong')).toHaveCount(0)
		await expect(page.getByText('Try again')).toHaveCount(0)

		await page.getByRole('button', { name: 'Повторить' }).click()
		await expect(page.getByRole('heading', { level: 1, name: ERROR_HEADING })).toBeVisible()

		await page.getByRole('link', { name: 'На главную' }).click()
		await expect(page).toHaveURL(/\/dashboard\/?$/)
		await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
	})

	test('the test layout lets the editor page render', async ({ adminPage: page }, testInfo) => {
		const allTemplates = seedTest(projectKey(testInfo), 'all-templates')
		const url = `/admin/tests/${TOPIC_SLUG}/${allTemplates.slug}`
		await page.goto(url)
		await expect(page).toHaveURL(new RegExp(`${url}/?$`))
		await expect(page.getByText(allTemplates.title).first()).toBeVisible()
		await expect(page.getByText('Нет доступа к тесту')).toHaveCount(0)
		await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
	})
})
