import { can, canOpenPath, type PermissionKey } from '@bio-exam/rbac'

import { HOME_PATH } from './paths'

export type NavGroupKey = 'main' | 'work' | 'catalog' | 'settings' | 'personal'

export type NavIcon =
	| 'home'
	| 'tests'
	| 'admin'
	| 'bank'
	| 'newTest'
	| 'attempts'
	| 'users'
	| 'groups'
	| 'questionTypes'
	| 'scoring'
	| 'settings'
	| 'rbac'
	| 'chart'
	| 'links'
	| 'profile'
	| 'sitemap'

export type NavSection = {
	key: string
	href: string
	title: string
	description: string
	teacherDescription?: string
	group: NavGroupKey
	icon: NavIcon
	requires?: PermissionKey
	inMenu: boolean
}

export type NavGroup = {
	key: NavGroupKey
	title: string
	sections: NavSection[]
}

export const NAV_GROUP_TITLES: Readonly<Record<NavGroupKey, string>> = {
	main: 'Основное',
	work: 'Управление',
	catalog: 'Настройки теста',
	settings: 'Настройки общие',
	personal: 'Личное',
}

const GROUP_ORDER: readonly NavGroupKey[] = ['main', 'work', 'catalog', 'settings', 'personal']

export const NAV_SECTIONS: readonly NavSection[] = [
	{
		key: 'home',
		href: HOME_PATH,
		title: 'Главная',
		description: 'Сводка, график результатов и последние попытки.',
		group: 'main',
		icon: 'home',
		inMenu: true,
	},
	{
		key: 'tests',
		href: '/tests',
		title: 'Тесты',
		description: 'Тесты для прохождения по темам.',
		group: 'main',
		icon: 'tests',
		inMenu: true,
	},
	{
		key: 'admin',
		href: '/admin',
		title: 'Панель управления',
		description: 'Все разделы управления с кратким описанием.',
		group: 'work',
		icon: 'admin',
		inMenu: true,
	},
	{
		key: 'bank',
		href: '/admin/tests',
		title: 'Банк заданий',
		description: 'Темы, тесты, вопросы и правила оценивания.',
		teacherDescription: 'Тесты и вопросы закреплённых за вами тем.',
		group: 'work',
		icon: 'bank',
		inMenu: true,
	},
	{
		key: 'newTest',
		href: '/admin/tests/new',
		title: 'Новый тест',
		description: 'Создание теста с вопросами.',
		group: 'work',
		icon: 'newTest',
		requires: 'tests.write',
		inMenu: false,
	},
	{
		key: 'attempts',
		href: '/admin/attempts',
		title: 'Попытки',
		description: 'Журнал прохождений, баллы и разбор ответов.',
		teacherDescription: 'Попытки учеников по вашим темам и разбор ответов.',
		group: 'work',
		icon: 'attempts',
		inMenu: true,
	},
	{
		key: 'users',
		href: '/admin/users',
		title: 'Пользователи',
		description: 'Аккаунты учеников, учителей и администраторов, приглашения.',
		teacherDescription: 'Ученики ваших групп и приглашение новых.',
		group: 'work',
		icon: 'users',
		inMenu: true,
	},
	{
		key: 'groups',
		href: '/admin/groups',
		title: 'Группы',
		description: 'Учебные группы и их состав.',
		teacherDescription: 'Ваши учебные группы и их состав.',
		group: 'work',
		icon: 'groups',
		inMenu: true,
	},
	{
		key: 'questionTypes',
		href: '/admin/tests/question-types',
		title: 'Типы вопросов',
		description: 'Шаблоны и настройки типов вопросов.',
		group: 'catalog',
		icon: 'questionTypes',
		inMenu: true,
	},
	{
		key: 'scoring',
		href: '/admin/tests/scoring',
		title: 'Настройка баллов',
		description: 'Баллы за типы вопросов, общие и для отдельного теста.',
		group: 'catalog',
		icon: 'scoring',
		inMenu: true,
	},
	{
		key: 'settings',
		href: '/admin/settings',
		title: 'Настройки',
		description: 'Все системные настройки на одном экране.',
		group: 'settings',
		icon: 'settings',
		inMenu: false,
	},
	{
		key: 'rbac',
		href: '/admin/settings/rbac',
		title: 'Права доступа',
		description: 'Роли и разрешения.',
		group: 'settings',
		icon: 'rbac',
		inMenu: true,
	},
	{
		key: 'chart',
		href: '/admin/settings/chart',
		title: 'Графики',
		description: 'Тип, оси и период каждого графика.',
		group: 'settings',
		icon: 'chart',
		inMenu: true,
	},
	{
		key: 'links',
		href: '/admin/sidebar',
		title: 'Ссылки в меню',
		description: 'Дополнительные ссылки в боковом меню.',
		group: 'settings',
		icon: 'links',
		inMenu: true,
	},
	{
		key: 'profile',
		href: '/profile',
		title: 'Профиль',
		description: 'Личные данные, аватар и пароль.',
		group: 'personal',
		icon: 'profile',
		inMenu: false,
	},
	{
		key: 'sitemap',
		href: '/sitemap',
		title: 'Карта сайта',
		description: 'Все доступные вам разделы.',
		group: 'personal',
		icon: 'sitemap',
		inMenu: false,
	},
]

const BY_HREF = new Map(NAV_SECTIONS.map((section) => [section.href, section]))

export function sectionByHref(href: string): NavSection | undefined {
	return BY_HREF.get(href)
}

export function canOpenSection(perms: ReadonlySet<PermissionKey>, section: NavSection): boolean {
	if (!canOpenPath(perms, section.href)) return false
	return section.requires ? can(perms, section.requires) : true
}

export function sectionDescription(perms: ReadonlySet<PermissionKey>, section: NavSection): string {
	return section.teacherDescription && !can(perms, 'zone.all') ? section.teacherDescription : section.description
}

function grouped(sections: readonly NavSection[]): NavGroup[] {
	return GROUP_ORDER.map((key) => ({
		key,
		title: NAV_GROUP_TITLES[key],
		sections: sections.filter((section) => section.group === key),
	})).filter((group) => group.sections.length > 0)
}

export function visibleSections(perms: ReadonlySet<PermissionKey>): NavSection[] {
	return NAV_SECTIONS.filter((section) => canOpenSection(perms, section))
}

export function menuGroups(perms: ReadonlySet<PermissionKey>): NavGroup[] {
	return grouped(visibleSections(perms).filter((section) => section.inMenu))
}

export function siteMapGroups(perms: ReadonlySet<PermissionKey>): NavGroup[] {
	return grouped(visibleSections(perms).filter((section) => section.key !== 'sitemap'))
}

export function adminHubGroups(perms: ReadonlySet<PermissionKey>): NavGroup[] {
	return grouped(
		visibleSections(perms).filter(
			(section) => section.group !== 'main' && section.group !== 'personal' && section.key !== 'admin'
		)
	)
}

export function settingsSections(perms: ReadonlySet<PermissionKey>): NavSection[] {
	return visibleSections(perms).filter((section) => section.group === 'settings' && section.key !== 'settings')
}

export function quickLinkSections(perms: ReadonlySet<PermissionKey>): NavSection[] {
	return visibleSections(perms).filter((section) => section.group === 'work' && section.inMenu)
}

export function searchSections(perms: ReadonlySet<PermissionKey>, query: string): NavSection[] {
	const needle = query.trim().toLocaleLowerCase('ru')
	if (needle.length === 0) return []
	return visibleSections(perms).filter(
		(section) =>
			section.title.toLocaleLowerCase('ru').includes(needle) ||
			sectionDescription(perms, section).toLocaleLowerCase('ru').includes(needle)
	)
}

type LinkLike = { url: string }

export function extraMenuLinks<T extends LinkLike>(items: readonly T[]): T[] {
	const seen = new Set<string>()
	return items.filter((item) => {
		const url = item.url.length > 1 && item.url.endsWith('/') ? item.url.slice(0, -1) : item.url
		if (url === '/' || BY_HREF.has(url) || seen.has(url)) return false
		seen.add(url)
		return true
	})
}
