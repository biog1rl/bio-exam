import { loginAccount, seedTest, seedTopic, sessionAccount } from '../fixtures/accounts'
import { expect, projectKey, test, TOPIC_SLUG } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

const SAVE_BAR = 'Сохранение изменений'
const SETTINGS = 'Настройки теста'
const PHOTO_WINDOW = 'Окно для фото после окончания времени, мин'
const PHOTO_WINDOW_INVALID = 'Введите целое число минут от 0 до 120'
const PHOTO_WINDOW_TOAST = 'Окно для фото: введите целое число минут от 0 до 120'

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

	test('photo window field shows the seeded value, saves it and keeps it after a reload @test-editor', async ({
		adminPage: page,
	}, testInfo) => {
		const seeded = seedTest(projectKey(testInfo), 'photo-window')
		const path = `/admin/tests/${seeded.topic}/${seeded.slug}`
		const sheet = page.getByRole('dialog', { name: SETTINGS })
		const settingsResponse = () =>
			page.waitForResponse(
				(response) => response.url().includes('/settings') && response.request().method() === 'PATCH'
			)

		await page.goto(path)
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(sheet.getByLabel(PHOTO_WINDOW)).toHaveValue('15')

		await sheet.getByLabel(PHOTO_WINDOW).fill('0')
		const saved = settingsResponse()
		await sheet.getByRole('button', { name: 'Сохранить', exact: true }).click()
		expect((await saved).status()).toBe(200)

		await page.reload()
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(sheet.getByLabel(PHOTO_WINDOW)).toHaveValue('0')

		await sheet.getByLabel(PHOTO_WINDOW).fill('15')
		const restored = settingsResponse()
		await sheet.getByRole('button', { name: 'Сохранить', exact: true }).click()
		expect((await restored).status()).toBe(200)
		await page.reload()
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(sheet.getByLabel(PHOTO_WINDOW)).toHaveValue('15')
	})

	test('photo window field is hidden without an open question; a wrong value is not sent and is explained @test-editor', async ({
		adminPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const sheet = page.getByRole('dialog', { name: SETTINGS })
		const field = sheet.getByLabel(PHOTO_WINDOW)

		const plain = seedTest(key, 'all-templates')
		await page.goto(`/admin/tests/${TOPIC_SLUG}/${plain.slug}`)
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(sheet.getByLabel('Название')).toBeVisible()
		await expect(field).toHaveCount(0)

		const seeded = seedTest(key, 'photo-window')
		await page.goto(`/admin/tests/${seeded.topic}/${seeded.slug}`)
		await page.getByRole('button', { name: SETTINGS, exact: true }).click()
		await expect(field).toBeVisible()
		await expect(sheet.getByText('Отсчёт — от сдачи теста. 0 — фото только до сдачи.')).toBeVisible()
		expect(await lowContrastTexts(page), 'contrast of the photo window hint').toEqual([])

		let patches = 0
		page.on('request', (request) => {
			if (request.method() === 'PATCH' && request.url().includes('/settings')) patches++
		})

		await field.fill('121')
		await expect(field).toHaveAttribute('aria-invalid', 'true')
		await expect(sheet.getByText(PHOTO_WINDOW_INVALID, { exact: true })).toBeVisible()
		expect(await lowContrastTexts(page), 'contrast of the photo window error').toEqual([])

		await sheet.getByRole('button', { name: 'Сохранить', exact: true }).click()
		await expect(page.getByText(PHOTO_WINDOW_TOAST, { exact: true })).toBeVisible()
		await expect(field).toBeFocused()
		expect(patches).toBe(0)

		await field.fill('')
		await expect(sheet.getByText('Укажите число минут от 0 до 120', { exact: true })).toBeVisible()
		await field.fill('12.5')
		await expect(sheet.getByText(PHOTO_WINDOW_INVALID, { exact: true })).toBeVisible()
	})

	test('«Добавить вопрос» in a new test without a title explains it and creates nothing @test-editor', async ({
		adminPage: page,
	}) => {
		await page.goto(`/admin/tests/new?topic=${TOPIC_SLUG}`)
		const topicSelect = page.getByText('Тема', { exact: true }).locator('xpath=..').getByRole('combobox')
		await expect(topicSelect).toContainText(seedTopic(TOPIC_SLUG).title)
		await expect(page.getByPlaceholder('Тест по теме...')).toHaveValue('')

		let creates = 0
		page.on('request', (request) => {
			if (request.method() === 'POST' && request.url().includes('/api/tests/save')) creates++
		})

		await page.keyboard.press('Escape')
		await expect(page.getByRole('dialog', { name: SETTINGS })).toHaveCount(0)
		await page.getByRole('button', { name: 'Добавить вопрос' }).first().click()

		await expect(page.getByText('Введите название теста', { exact: true })).toBeVisible()
		await expect(page).toHaveURL(/\/admin\/tests\/new(\?|$)/)
		expect(creates).toBe(0)
	})
})
