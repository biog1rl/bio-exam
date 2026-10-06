import { type Page } from '@playwright/test'

import { randomUUID } from 'node:crypto'

import { seedTest, seedTopic, sessionAccount, sessionAccountByPrefix, type ProjectKey } from '../fixtures/accounts'
import { bankTopicTitles } from '../fixtures/bank'
import {
	adminReviewSections,
	correctAnswers,
	expect,
	newAccountContext,
	newSessionContext,
	projectKey,
	takeTest,
	test,
	TOPIC_SLUG,
} from '../fixtures/exam'

function teacherTopic(key: ProjectKey) {
	return seedTopic(`e2e-teacher-${key}`)
}

function assignTopic(key: ProjectKey) {
	return seedTopic(`e2e-assign-${key}`)
}

function teacherName(key: ProjectKey): string {
	return sessionAccount(key, 'teacher').name
}

async function expectDenied(page: Page, path: string, title: string, backLabel: string): Promise<void> {
	await page.goto(path)
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
	await expect(page.getByRole('link', { name: backLabel })).toBeVisible()
}

async function startAndSubmitForeignAttempt(page: Page, slug: string): Promise<string> {
	const testResponse = await page.request.get(`/api/tests/public/topics/${TOPIC_SLUG}/tests/${slug}`)
	expect(testResponse.ok(), `read test ${slug}`).toBe(true)
	const { test: foreign } = (await testResponse.json()) as { test: { id: string } }

	const started = await page.request.post(`/api/tests/public/tests/${foreign.id}/start`)
	expect(started.ok(), `start ${slug}`).toBe(true)
	const { sessionId } = (await started.json()) as { sessionId: string }

	const submitted = await page.request.post(`/api/tests/public/tests/${foreign.id}/submit`, {
		data: { sessionId, clientAttemptId: randomUUID(), answers: {} },
	})
	expect(submitted.ok(), `submit ${slug}`).toBe(true)
	const { attemptId } = (await submitted.json()) as { attemptId: string }
	expect(attemptId).toBeTruthy()
	return attemptId
}

test.describe.serial('D-31: teacher works only in his zone', () => {
	let zoneAttemptId = ''

	test('session accounts keep their order and the teacher is denied a foreign topic @teacher-zone', async ({
		teacherPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		expect(sessionAccount(key, 'user').login).toBe(`student-${key}`)
		expect(sessionAccount(key, 'admin').login).toBe(`admin-${key}`)
		expect(sessionAccount(key, 'teacher').login).toBe(`teacher-${key}`)
		expect(sessionAccountByPrefix(key, 'zone-student').role).toBe('user')

		await expectDenied(page, `/admin/tests/${TOPIC_SLUG}`, 'Нет доступа к теме', 'К темам')
		await expect(page.getByRole('link', { name: 'Новый тест' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Действия с темой', exact: true })).toHaveCount(0)
	})

	test('step 1: admin pins the teacher to a topic in the topic form @teacher-zone', async ({
		adminPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const topic = assignTopic(key)
		const name = teacherName(key)

		await page.goto(`/admin/tests/${topic.slug}`)
		await expect(page.getByRole('heading', { level: 1, name: topic.title })).toBeVisible()
		await page.getByRole('button', { name: 'Действия с темой', exact: true }).click()
		await page.getByRole('menuitem', { name: 'Изменить тему', exact: true }).click()

		const dialog = page.getByRole('dialog', { name: 'Редактировать тему' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('Учителя', { exact: true })).toBeVisible()
		await dialog.getByRole('combobox').filter({ hasText: 'Выберите учителей' }).click()
		const search = page.getByPlaceholder('Поиск по имени')
		await search.fill(name)
		await page.getByRole('option', { name, exact: true }).click()
		await page.keyboard.press('Escape')
		await expect(search).toHaveCount(0)

		await expect(dialog.getByRole('button', { name: `Убрать ${name}` })).toBeVisible()
		await dialog.getByRole('button', { name: 'Сохранить тему', exact: true }).click()
		await expect(page.getByText('Тема обновлена').first()).toBeVisible()
		await expect(dialog).toHaveCount(0)

		await page.reload()
		await page.getByRole('button', { name: 'Действия с темой', exact: true }).click()
		await page.getByRole('menuitem', { name: 'Изменить тему', exact: true }).click()
		await expect(dialog.getByRole('button', { name: `Убрать ${name}` })).toBeVisible()
		await page.keyboard.press('Escape')
	})

	test('step 2: the teacher sees only his topics and no catalog actions @teacher-zone', async ({
		teacherPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)

		await page.goto('/admin/tests')
		await expect(page.getByText(seedTest(key, 'teacher-test').title, { exact: true }).first()).toBeVisible()
		const topics = await bankTopicTitles(page)
		expect(topics).toContain(teacherTopic(key).title)
		expect(topics).toContain(assignTopic(key).title)
		expect(topics).not.toContain(seedTopic(TOPIC_SLUG).title)
		await expect(page.getByText(seedTest(key, 'foreign').title, { exact: true })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Создать тему' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Настройки банка' })).toHaveCount(0)
		await expect(page.getByText('Баллы', { exact: true })).toHaveCount(0)
		await expect(page.getByText('Типы вопросов', { exact: true })).toHaveCount(0)
	})

	test('step 3: the teacher creates a test in his topic @teacher-zone', async ({ teacherPage: page }, testInfo) => {
		const key = projectKey(testInfo)
		const topic = teacherTopic(key)
		const slug = `teacher-made-${key}`
		const title = `Тест, созданный учителем (${key})`

		await page.goto('/admin/tests/new')
		const topicSelect = page.getByText('Тема', { exact: true }).locator('xpath=..').getByRole('combobox')
		await expect(topicSelect).toBeEnabled()
		await topicSelect.click()
		await expect(page.getByRole('option', { name: seedTopic(TOPIC_SLUG).title, exact: true })).toHaveCount(0)
		await page.getByRole('option', { name: topic.title, exact: true }).click()
		await expect(topicSelect).toContainText(topic.title)

		await page.getByPlaceholder('Тест по теме...').fill(title)
		await page.getByPlaceholder('test-slug').fill(slug)
		await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click()

		await expect(page).toHaveURL(new RegExp(`/admin/tests/${topic.slug}/${slug}/?$`))
		const created = await page.request.get(`/api/tests/by-slug/${topic.slug}/${slug}`)
		expect(created.ok(), 'the created test is readable by the teacher').toBe(true)
		expect(((await created.json()) as { test: { title: string } }).test.title).toBe(title)
	})

	test('step 4: the teacher invites a student into his group and gets a link @teacher-zone', async ({
		teacherPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)

		await page.goto('/admin/users')
		await expect(page.getByRole('heading', { name: 'Пользователи', exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Пригласить ученика', exact: true }).click()

		const dialog = page.getByRole('dialog', { name: 'Пригласить ученика' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Роль')).toHaveCount(0)
		await expect(dialog.getByLabel('Группа')).toContainText(`E2E группа ${key}`)

		await dialog.getByLabel('Имя').fill('Приглашённый')
		await dialog.getByLabel('Фамилия').fill(key)
		await dialog.getByLabel('Логин').fill(`invited-${key}`)
		await dialog.getByRole('button', { name: 'Пригласить ученика', exact: true }).click()

		await expect(dialog.getByText('Отправьте пользователю эту одноразовую ссылку:')).toBeVisible()
		await expect(dialog.locator('input[readonly]')).toHaveValue(/\/invite\/\S+$/)
	})

	test('step 5: the teacher assigns his test on the student page @teacher-zone', async ({
		teacherPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const student = sessionAccountByPrefix(key, 'zone-student')
		const teacherTest = seedTest(key, 'teacher-test')

		await page.goto(`/profile/${student.login}`)
		await expect(page.getByRole('heading', { name: student.name }).first()).toBeVisible()
		await expect(page.getByText('Нет назначенных тестов')).toBeVisible()

		await page.getByRole('button', { name: `Назначить: ${teacherTest.title}`, exact: true }).click()
		await expect(page.getByText('Тест назначен').first()).toBeVisible()
		await expect(page.getByText('Нет назначенных тестов')).toHaveCount(0)
		const removeButtons = page.getByRole('button', { name: /^Удалить назначение/ })
		await expect(removeButtons).toHaveCount(1)
		await expect(removeButtons).toHaveAccessibleName(`Удалить назначение: ${teacherTest.title}`)
		await expect(page.getByRole('button', { name: `Назначить: ${teacherTest.title}`, exact: true })).toHaveCount(0)
	})

	test('step 6: the zone student takes the assigned test @teacher-zone', async ({ browser }, testInfo) => {
		const key = projectKey(testInfo)
		const teacherTest = seedTest(key, 'teacher-test')
		const context = await newAccountContext(browser, testInfo, sessionAccountByPrefix(key, 'zone-student').login)
		try {
			const submitted = await takeTest(await context.newPage(), teacherTest, correctAnswers(teacherTest))
			expect(submitted.passed).toBe(true)
			zoneAttemptId = submitted.attemptId
		} finally {
			await context.close()
		}
	})

	test('step 7: the teacher finds the attempt and opens its review @teacher-zone', async ({
		teacherPage: page,
	}, testInfo) => {
		expect(zoneAttemptId, 'step 6 must have produced an attempt').not.toBe('')
		const key = projectKey(testInfo)
		const teacherTest = seedTest(key, 'teacher-test')

		await page.goto('/admin/attempts')
		const link = page.locator(`a[href="/admin/attempts/${zoneAttemptId}"]`)
		const row = page.getByRole('row').filter({ has: link })
		await expect(row).toBeVisible()
		await expect(link).toHaveText(teacherTest.title)
		await expect(row).toContainText(sessionAccountByPrefix(key, 'zone-student').name)
		await link.click()

		await expect(page).toHaveURL(new RegExp(`/admin/attempts/${zoneAttemptId}$`))
		const sections = await adminReviewSections(page, zoneAttemptId, teacherTest.questions.length)
		expect(sections[0]).toContain(teacherTest.questions[0].prompt)
	})

	test('step 8: a foreign topic, test and attempt are denied by direct link @teacher-zone', async ({
		browser,
		teacherPage: page,
	}, testInfo) => {
		const key = projectKey(testInfo)
		const foreign = seedTest(key, 'foreign')

		const student = await newSessionContext(browser, testInfo, 'user')
		let foreignAttemptId = ''
		try {
			foreignAttemptId = await startAndSubmitForeignAttempt(await student.newPage(), foreign.slug)
		} finally {
			await student.close()
		}

		await page.goto('/admin/attempts')
		await expect(page.locator(`a[href="/admin/attempts/${zoneAttemptId}"]`)).toBeVisible()
		await expect(page.locator(`a[href="/admin/attempts/${foreignAttemptId}"]`)).toHaveCount(0)

		await expectDenied(page, `/admin/tests/${TOPIC_SLUG}`, 'Нет доступа к теме', 'К темам')
		await expectDenied(page, `/admin/tests/${TOPIC_SLUG}/${foreign.slug}`, 'Нет доступа к тесту', 'К темам')
		await expectDenied(page, `/admin/attempts/${foreignAttemptId}`, 'Нет доступа к попытке', 'К попыткам')
	})
})
