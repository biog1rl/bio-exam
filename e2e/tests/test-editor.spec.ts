import { loginAccount, seedTest, sessionAccount } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const SAVE_BAR = 'Сохранение изменений'
const SETTINGS = 'Настройки теста'

test.describe('test editor: question table, settings panel and student access', () => {
	test('question table searches by number, sorts in three steps and locks the drag handle @test-editor', async ({
		adminPage: page,
	}, testInfo) => {
		const seeded = seedTest(projectKey(testInfo), 'all-templates')
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${seeded.slug}`)
		await expect(page.getByRole('heading', { level: 1, name: seeded.title })).toBeVisible()

		const questionsTab = page.getByRole('tab', { name: /^Вопросы · \d+$/ })
		await expect(questionsTab).toHaveAttribute('aria-selected', 'true')
		await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveCount(0)
		await expect(page.getByRole('region', { name: SAVE_BAR })).toHaveCount(0)

		const total = Number((await questionsTab.textContent())?.replace(/\D+/g, ''))
		expect(total).toBeGreaterThan(1)
		const handle = (n: number) =>
			page.getByRole('button', { name: `Перетащить вопрос ${n}`, exact: true, includeHidden: true })
		await expect(handle(1)).toBeEnabled()

		const search = page.getByRole('searchbox', { name: 'Поиск вопросов' })
		await search.fill('2')
		await expect(page.getByText(`Показано 1 из ${total}`)).toBeVisible()
		await expect(handle(2)).toBeDisabled()
		await search.fill('')
		await expect(handle(2)).toBeEnabled()

		const textHead = page.getByRole('columnheader', { name: 'Вопрос' })
		const numberHead = page.getByRole('columnheader', { name: '№' })
		await expect(numberHead).toHaveAttribute('aria-sort', 'ascending')
		await textHead.getByRole('button').click()
		await expect(textHead).toHaveAttribute('aria-sort', 'ascending')
		await expect(handle(1)).toBeDisabled()
		await textHead.getByRole('button').click()
		await expect(textHead).toHaveAttribute('aria-sort', 'descending')
		await textHead.getByRole('button').click()
		await expect(textHead).not.toHaveAttribute('aria-sort')
		await expect(numberHead).toHaveAttribute('aria-sort', 'ascending')
		await expect(handle(1)).toBeEnabled()

		expect(await lowContrastTexts(page), 'contrast of the question table').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the question table').toEqual([])

		await page
			.getByRole('row')
			.nth(1)
			.click({ position: { x: 4, y: 4 } })
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}/${seeded.slug}/questions/[0-9a-f-]+$`))
	})

	test('settings open in a side panel; closing with changes shows one save bar, «Отменить» restores @test-editor', async ({
		adminPage: page,
	}, testInfo) => {
		const seeded = seedTest(projectKey(testInfo), 'all-templates')
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${seeded.slug}`)
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()

		const sheet = page.getByRole('dialog', { name: SETTINGS })
		const title = sheet.getByLabel('Название')
		await expect(title).toHaveValue(seeded.title)
		await expect(sheet.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()

		await title.fill(`${seeded.title} (черновик правки)`)
		await expect(sheet.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
		await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(1)
		expect(await lowContrastTexts(page), 'contrast of the settings panel').toEqual([])
		expect(await horizontalOverflow(page), 'overflow with the settings panel').toEqual([])

		await sheet.getByRole('button', { name: 'Закрыть' }).click()
		await expect(sheet).toHaveCount(0)
		const saveBar = page.getByRole('region', { name: SAVE_BAR })
		await expect(saveBar).toContainText('Есть несохранённые изменения')
		await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(1)
		expect(await lowContrastTexts(page), 'contrast with the save bar').toEqual([])

		await saveBar.getByRole('button', { name: 'Отменить' }).click()
		await expect(saveBar).toHaveCount(0)
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(sheet.getByLabel('Название')).toHaveValue(seeded.title)
		await sheet.getByRole('button', { name: 'Закрыть' }).click()

		await page.getByRole('switch', { name: 'Опубликовать тест' }).click()
		await expect(saveBar).toBeVisible()
		await saveBar.getByRole('button', { name: 'Отменить' }).click()
		await expect(saveBar).toHaveCount(0)
	})

	test('student access is a table that lives in the address; a student is added and removed @test-editor', async ({
		adminPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const assigned = seedTest(key, 'all-templates')
		const student = sessionAccount(key, 'user')
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${assigned.slug}`)
		await page.getByRole('tab', { name: /^Доступ учеников · \d+$/ }).click()
		await expect(page).toHaveURL(new RegExp(`/admin/tests/${TOPIC_SLUG}/${assigned.slug}\\?tab=access$`))
		await page.reload()
		await expect(page.getByRole('tab', { name: /^Доступ учеников · \d+$/ })).toHaveAttribute('aria-selected', 'true')
		await expect(page.getByRole('row').filter({ hasText: student.name })).toHaveCount(1)
		expect(await lowContrastTexts(page), 'contrast of the access table').toEqual([])
		expect(await horizontalOverflow(page), 'overflow of the access table').toEqual([])

		await page.getByRole('button', { name: 'Фильтр по статусу' }).click()
		await expect(page.getByRole('menuitemcheckbox', { name: /^Активен/ })).toHaveAttribute('aria-checked', 'true')
		await page.getByRole('menuitemcheckbox', { name: /^Активен/ }).click()
		await page.getByRole('menuitemcheckbox', { name: /^Неактивен/ }).click()
		await page.keyboard.press('Escape')
		await expect(page.getByRole('row').filter({ hasText: student.name })).toHaveCount(0)
		await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(page.getByRole('row').filter({ hasText: student.name })).toHaveCount(1)

		await page.getByRole('searchbox', { name: 'Поиск учеников' }).fill('нет такого ученика')
		await expect(page.getByText('Никого не нашли с такими фильтрами.')).toBeVisible()
		await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
		await expect(page.getByRole('row').filter({ hasText: student.name })).toHaveCount(1)

		const empty = seedTest(key, 'editor')
		const newcomer = loginAccount(key, 'user')
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${empty.slug}?tab=access`)
		await expect(page.getByText('У теста пока нет учеников с доступом')).toBeVisible()
		await page.getByRole('button', { name: 'Добавить ученика', exact: true }).click()
		await page.getByRole('combobox', { name: 'Найти ученика для добавления' }).fill(newcomer.login)
		await page.getByRole('option', { name: new RegExp(newcomer.name) }).click()
		await page.keyboard.press('Escape')

		const row = page.getByRole('row').filter({ hasText: newcomer.name })
		await expect(row).toHaveCount(1)
		await expect(page.getByRole('tab', { name: 'Доступ учеников · 1' })).toBeVisible()
		await row.getByRole('button', { name: `Убрать доступ: ${newcomer.name}` }).click()
		await expect(page.getByText('У теста пока нет учеников с доступом')).toBeVisible()
	})
})
