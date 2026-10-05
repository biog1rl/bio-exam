import type { Page, TestInfo } from '@playwright/test'

import { expect, projectKey, test } from '../fixtures/exam'
import { horizontalOverflow, lowContrastTexts } from '../fixtures/page-checks'

type Role = 'student' | 'teacher' | 'admin'

const MENU: Record<Role, string[]> = {
	student: ['Главная', 'Тесты'],
	teacher: ['Главная', 'Тесты', 'Панель управления', 'Банк заданий', 'Попытки', 'Пользователи', 'Группы'],
	admin: [
		'Главная',
		'Тесты',
		'Панель управления',
		'Банк заданий',
		'Попытки',
		'Пользователи',
		'Группы',
		'Типы вопросов',
		'Настройка баллов',
		'Права доступа',
		'Диапазон графика',
		'Ссылки в меню',
	],
}

const PAGES: Record<Role, string[]> = {
	student: ['/dashboard', '/tests', '/profile', '/sitemap'],
	teacher: ['/dashboard', '/tests', '/admin', '/admin/tests', '/admin/attempts', '/admin/users', '/admin/groups'],
	admin: [
		'/dashboard',
		'/admin',
		'/admin/tests',
		'/admin/tests/question-types',
		'/admin/tests/scoring',
		'/admin/settings',
		'/admin/settings/rbac',
		'/admin/sidebar',
	],
}

async function openMenu(page: Page, testInfo: TestInfo): Promise<void> {
	if (projectKey(testInfo) === 'mobile') await page.getByRole('button', { name: 'Открыть меню' }).click()
}

function mainNav(page: Page) {
	return page.getByRole('navigation', { name: 'Основная навигация' })
}

async function menuLinks(page: Page, testInfo: TestInfo): Promise<{ title: string; href: string }[]> {
	await page.goto('/dashboard')
	await openMenu(page, testInfo)
	const links = mainNav(page).getByRole('link')
	await expect(links.first()).toBeVisible()
	return links.evaluateAll((nodes) =>
		nodes.map((node) => ({ title: node.textContent?.trim() ?? '', href: node.getAttribute('href') ?? '' }))
	)
}

for (const role of ['student', 'teacher', 'admin'] as const) {
	test.describe(`navigation: ${role}`, () => {
		test(`${role} menu lists only the sections of the role, and every item opens a page @navigation`, async ({
			studentPage,
			teacherPage,
			adminPage,
		}, testInfo) => {
			const page = { student: studentPage, teacher: teacherPage, admin: adminPage }[role]
			const links = await menuLinks(page, testInfo)
			expect(links.map((link) => link.title)).toEqual(MENU[role])
			expect(links.find((link) => link.title === 'Главная')?.href).toBe('/dashboard')

			for (const link of links) {
				await page.goto(link.href)
				await expect(page.locator('main').first(), link.href).toBeVisible()
				await expect(page.getByRole('heading', { name: 'Страница не найдена' }), link.href).toHaveCount(0)
				await expect(page.getByRole('heading', { name: 'Нет доступа к разделу' }), link.href).toHaveCount(0)
			}
		})

		test(`${role} pages keep text readable and fit the screen @navigation`, async ({
			studentPage,
			teacherPage,
			adminPage,
		}, testInfo) => {
			const page = { student: studentPage, teacher: teacherPage, admin: adminPage }[role]
			for (const path of PAGES[role]) {
				await page.goto(path)
				await page.waitForLoadState('networkidle')
				expect(await lowContrastTexts(page), `contrast on ${path}`).toEqual([])
				expect(await horizontalOverflow(page), `overflow on ${path}`).toEqual([])
			}

			await page.goto('/dashboard')
			await openMenu(page, testInfo)
			await expect(mainNav(page)).toBeVisible()
			expect(await lowContrastTexts(page), 'contrast with the menu open').toEqual([])
		})
	})
}

test('the menu button exists only on narrow screens, and the menu closes after a click @navigation', async ({
	studentPage: page,
}, testInfo) => {
	await page.goto('/dashboard')
	const button = page.getByRole('button', { name: 'Открыть меню' })
	if (projectKey(testInfo) !== 'mobile') {
		await expect(button).toBeHidden()
		await expect(mainNav(page)).toBeVisible()
		return
	}
	await expect(mainNav(page)).toBeHidden()
	await button.click()
	await mainNav(page).getByRole('link', { name: 'Тесты', exact: true }).click()
	await expect(page).toHaveURL(/\/tests$/)
	await expect(mainNav(page)).toBeHidden()
})

test('«Ученики группы» opens the users list filtered by the group, the filter lives in the address @navigation', async ({
	adminPage: page,
}, testInfo) => {
	const groupName = `E2E группа ${projectKey(testInfo)}`
	await page.goto('/admin/groups')
	await page.getByRole('link', { name: `Ученики группы ${groupName}` }).click()
	await expect(page).toHaveURL(/\/admin\/users\?group=[^&]+$/)
	await expect(page.getByRole('combobox').filter({ hasText: groupName })).toBeVisible()

	await page.getByRole('combobox').filter({ hasText: groupName }).click()
	await page.getByRole('option', { name: 'Все группы' }).click()
	await expect(page).toHaveURL(/\/admin\/users$/)
})

test('a new page opens at the top, and «Назад» restores the previous scroll @navigation', async ({
	adminPage: page,
}, testInfo) => {
	const viewport = page.locator('[data-slot=sidebar-inset] [data-radix-scroll-area-viewport]')
	await page.goto('/admin')
	await expect(page.getByRole('heading', { level: 1, name: 'Панель управления' })).toBeVisible()
	await viewport.evaluate((element) => {
		element.scrollTop = 300
	})
	const saved = await viewport.evaluate((element) => element.scrollTop)
	expect(saved).toBeGreaterThan(0)

	await openMenu(page, testInfo)
	await mainNav(page).getByRole('link', { name: 'Группы', exact: true }).click()
	await expect(page).toHaveURL(/\/admin\/groups$/)
	await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)

	await page.goBack()
	await expect(page).toHaveURL(/\/admin$/)
	await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(saved)
})

test('page checks catch low contrast and overflow on a known bad page @navigation', async ({ page }) => {
	await page.setContent(
		'<main><p style="color:#bbbbbb;background:#ffffff;font-size:14px">серый текст</p><div style="width:4000px">широкий блок</div></main>'
	)
	expect(await lowContrastTexts(page)).toEqual([expect.stringContaining('серый текст')])
	expect(await horizontalOverflow(page)).not.toEqual([])
})

test('a student opening a staff section sees the access screen with a way home @navigation', async ({
	studentPage: page,
}) => {
	for (const path of ['/admin', '/admin/tests/scoring', '/admin/settings']) {
		await page.goto(path)
		await expect(page.getByRole('heading', { name: 'Нет доступа к разделу' }), path).toBeVisible()
		await expect(page.locator('main').getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/dashboard')
	}
})

test('the back button without history goes to the parent page @navigation', async ({ adminPage: page }) => {
	await page.goto('/admin/settings/rbac')
	await page.getByRole('button', { name: 'Назад' }).click()
	await expect(page).toHaveURL(/\/admin\/settings$/)
})

test('a section is found by name in the search dialog @navigation', async ({ adminPage: page }) => {
	await page.goto('/dashboard')
	await page.keyboard.press('ControlOrMeta+k')
	await page.getByPlaceholder('Введите запрос').fill('права')
	await page.getByRole('option', { name: /Права доступа/ }).click()
	await expect(page).toHaveURL(/\/admin\/settings\/rbac$/)
})
