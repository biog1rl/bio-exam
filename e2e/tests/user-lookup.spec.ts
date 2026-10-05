import { PROJECT_KEYS, seed } from '../fixtures/accounts'
import { expect, test } from '../fixtures/exam'

type BulkUsers = { prefix: string; count: number; name: string }

const bulk = (seed as unknown as { bulkUsers: BulkUsers }).bulkUsers
const OLDEST_BULK_NUMBER = 1

function bulkUser(number: number): { login: string; name: string } {
	const suffix = String(number).padStart(3, '0')
	return { login: `${bulk.prefix}-${suffix}`, name: `${bulk.name} ${suffix}` }
}

type UsersPage = { rows: { id: string; login: string | null }[] }

test.describe('D7: a user beyond the first 100 opens from the global search', () => {
	test('admin finds the oldest bulk user by name and lands on the profile by login', async ({ adminPage: page }) => {
		expect(bulk.count).toBeGreaterThan(100)
		const target = bulkUser(OLDEST_BULK_NUMBER)

		const defaultList = await page.request.get('/api/users')
		expect(defaultList.ok()).toBe(true)
		const defaultRows = ((await defaultList.json()) as UsersPage).rows
		expect(defaultRows).toHaveLength(100)
		const defaultLogins = new Set(defaultRows.map((row) => row.login))
		for (const key of PROJECT_KEYS) {
			for (const account of seed.projects[key].accounts) {
				expect(defaultLogins.has(account.login), `${account.login} in the default page`).toBe(true)
			}
		}
		expect(defaultLogins.has(target.login)).toBe(false)

		const fullList = await page.request.get('/api/users?limit=500')
		expect(fullList.ok()).toBe(true)
		const fullLogins = ((await fullList.json()) as UsersPage).rows.map((row) => row.login)
		expect(fullLogins).toContain(target.login)

		const lookup = await page.request.get(`/api/users/by-login/${encodeURIComponent(target.login)}`)
		expect(lookup.status()).toBe(200)

		await page.goto('/dashboard')
		await page.keyboard.press('Control+k')
		const input = page.getByPlaceholder('Введите запрос')
		await expect(input).toBeVisible()
		await input.fill(target.name)

		const result = page.getByRole('option').filter({ hasText: target.login }).first()
		await expect(result).toBeVisible()
		await result.click()

		await expect(page).toHaveURL(new RegExp(`/profile/${target.login}/?$`))
		await expect(page.getByRole('heading', { level: 1, name: target.name })).toBeVisible()
		await expect(page.getByText('Пользователь не найден')).toHaveCount(0)
	})

	test('an unknown login shows the not-found block', async ({ adminPage: page }) => {
		await page.goto(`/profile/${encodeURIComponent('нет-такого')}`)
		await expect(page.getByText('Пользователь не найден')).toBeVisible()
		await expect(page.getByText('Не удалось загрузить пользователя')).toHaveCount(0)
	})
})
