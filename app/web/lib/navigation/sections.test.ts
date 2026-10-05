import { PERMISSION_DOMAINS, ROLE_REGISTRY, type PermissionDomain, type PermissionKey } from '@bio-exam/rbac'

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	NAV_SECTIONS,
	adminHubGroups,
	extraMenuLinks,
	menuGroups,
	quickLinkSections,
	searchSections,
	sectionByHref,
	sectionDescription,
	settingsSections,
	siteMapGroups,
} from './sections'

const APP_DIR = fileURLToPath(new URL('../../app', import.meta.url))
const NOT_LISTED = new Set(['/', '/login'])

function rolePerms(role: keyof typeof ROLE_REGISTRY): Set<PermissionKey> {
	const keys = new Set<PermissionKey>()
	const grants = ROLE_REGISTRY[role].grants as Partial<Record<PermissionDomain, readonly string[]>>
	for (const domain of Object.keys(grants) as PermissionDomain[]) {
		const granted = grants[domain] ?? []
		const actions: readonly string[] = granted.includes('*') ? PERMISSION_DOMAINS[domain].actions : granted
		for (const action of actions) keys.add(`${domain}.${action}` as PermissionKey)
	}
	return keys
}

function staticPages(dir: string): string[] {
	const found: string[] = []
	for (const name of readdirSync(dir)) {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) found.push(...staticPages(full))
		else if (name === 'page.tsx') {
			const route = relative(APP_DIR, dir)
				.split(sep)
				.filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
			if (route.some((segment) => segment.startsWith('['))) continue
			found.push(`/${route.join('/')}`)
		}
	}
	return found
}

const hrefs = (groups: { sections: { href: string }[] }[]) =>
	groups.flatMap((group) => group.sections.map((s) => s.href))

describe('состав реестра', () => {
	it('каждая страница без параметров в адресе есть в реестре, и каждый адрес реестра — страница', () => {
		const pages = staticPages(APP_DIR).filter((href) => !NOT_LISTED.has(href))
		expect(
			NAV_SECTIONS.map((section) => section.href)
				.slice()
				.sort()
		).toEqual(pages.slice().sort())
	})

	it('заголовок вкладки раздела совпадает с названием в реестре', () => {
		const PROTECTED_DIR = join(APP_DIR, '(internal)', '(protected)')
		for (const section of NAV_SECTIONS) {
			const titles = ['page.tsx', 'layout.tsx']
				.map((file) => join(PROTECTED_DIR, ...section.href.split('/').filter(Boolean), file))
				.filter((file) => existsSync(file))
				.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/metadata[^=]*=\s*\{[^}]*title:\s*'([^']+)'/g)])
				.map((match) => match[1])
			expect(titles, section.href).toEqual([section.title])
		}
	})

	it('у каждого адреса одно название', () => {
		const titles = NAV_SECTIONS.map((section) => section.title)
		expect(new Set(titles).size).toBe(titles.length)
		expect(sectionByHref('/admin/tests')?.title).toBe('Банк заданий')
		expect(sectionByHref('/dashboard')?.title).toBe('Главная')
		expect(sectionByHref('/nope')).toBeUndefined()
	})
})

describe('меню по ролям', () => {
	it('ученик видит только основное', () => {
		expect(menuGroups(rolePerms('user')).map((group) => group.key)).toEqual(['main'])
		expect(hrefs(menuGroups(rolePerms('user')))).toEqual(['/dashboard', '/tests'])
	})

	it('учитель видит основное и управление без каталога и настроек', () => {
		const groups = menuGroups(rolePerms('teacher'))
		expect(groups.map((group) => group.title)).toEqual(['Основное', 'Управление'])
		expect(hrefs(groups)).toEqual([
			'/dashboard',
			'/tests',
			'/admin',
			'/admin/tests',
			'/admin/attempts',
			'/admin/users',
			'/admin/groups',
		])
	})

	it('администратор видит все группы меню', () => {
		const groups = menuGroups(rolePerms('admin'))
		expect(groups.map((group) => group.title)).toEqual(['Основное', 'Управление', 'Настройки теста', 'Настройки общие'])
		expect(hrefs(groups)).toContain('/admin/settings/rbac')
		expect(hrefs(groups)).toContain('/admin/sidebar')
		expect(hrefs(groups)).not.toContain('/admin/settings')
		expect(hrefs(groups)).not.toContain('/admin/tests/new')
	})
})

describe('карта сайта, панель управления, настройки, быстрые ссылки', () => {
	it('карта сайта не перечисляет саму себя и показывает личное', () => {
		const groups = siteMapGroups(rolePerms('user'))
		expect(groups.map((group) => group.key)).toEqual(['main', 'personal'])
		expect(hrefs(groups)).toEqual(['/dashboard', '/tests', '/profile'])
	})

	it('карта сайта администратора содержит все страницы реестра, кроме себя', () => {
		expect(hrefs(siteMapGroups(rolePerms('admin'))).length).toBe(NAV_SECTIONS.length - 1)
	})

	it('без права записи тестов нет нового теста', () => {
		const perms = new Set<PermissionKey>(['tests.read'])
		expect(hrefs(siteMapGroups(perms))).not.toContain('/admin/tests/new')
		expect(hrefs(siteMapGroups(rolePerms('teacher')))).toContain('/admin/tests/new')
	})

	it('панель управления не содержит саму себя, основное и личное', () => {
		const teacher = adminHubGroups(rolePerms('teacher'))
		expect(teacher.map((group) => group.key)).toEqual(['work'])
		expect(hrefs(teacher)).toEqual([
			'/admin/tests',
			'/admin/tests/new',
			'/admin/attempts',
			'/admin/users',
			'/admin/groups',
		])
		expect(adminHubGroups(rolePerms('user'))).toEqual([])
		expect(adminHubGroups(rolePerms('admin')).map((group) => group.key)).toEqual(['work', 'catalog', 'settings'])
	})

	it('плитки настроек фильтруются по правам', () => {
		expect(settingsSections(rolePerms('admin')).map((section) => section.href)).toEqual([
			'/admin/settings/rbac',
			'/admin/settings/chart',
			'/admin/sidebar',
		])
		const settingsOnly = new Set<PermissionKey>(['settings.manage'])
		expect(settingsSections(settingsOnly).map((section) => section.href)).toEqual([
			'/admin/settings/chart',
			'/admin/sidebar',
		])
	})

	it('быстрые ссылки дашборда — разделы управления из меню', () => {
		expect(quickLinkSections(rolePerms('user'))).toEqual([])
		expect(quickLinkSections(rolePerms('teacher')).map((section) => section.title)).toEqual([
			'Панель управления',
			'Банк заданий',
			'Попытки',
			'Пользователи',
			'Группы',
		])
	})
})

describe('описания и поиск разделов', () => {
	it('учитель без zone.all получает тексты учителя', () => {
		const bank = sectionByHref('/admin/tests')!
		expect(sectionDescription(rolePerms('teacher'), bank)).toBe('Тесты и вопросы закреплённых за вами тем.')
		expect(sectionDescription(rolePerms('admin'), bank)).toBe('Темы, тесты, вопросы и правила оценивания.')
	})

	it('поиск находит видимые разделы по названию и описанию без учёта регистра', () => {
		expect(searchSections(rolePerms('admin'), 'ПРАВА').map((section) => section.href)).toEqual(['/admin/settings/rbac'])
		expect(searchSections(rolePerms('user'), 'права')).toEqual([])
		expect(searchSections(rolePerms('teacher'), 'групп').map((section) => section.href)).toContain('/admin/groups')
		expect(searchSections(rolePerms('admin'), '   ')).toEqual([])
	})
})

describe('extraMenuLinks', () => {
	it('отбрасывает корень, адреса разделов и повторы, сохраняет порядок', () => {
		const items = [
			{ id: '1', url: '/' },
			{ id: '2', url: '/dashboard' },
			{ id: '3', url: 'https://example.test/docs' },
			{ id: '4', url: '/admin/' },
			{ id: '5', url: '/exam-rules' },
			{ id: '6', url: '/exam-rules/' },
		]
		expect(extraMenuLinks(items).map((item) => item.id)).toEqual(['3', '5'])
	})
})
