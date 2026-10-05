import { can, type PermissionKey } from '@bio-exam/rbac'

import { canAccessSection, sectionForPath } from '@/lib/session/route-permissions'

export type SitePage = {
	href: string
	title: string
	description: string
	requires?: PermissionKey
}

export type SiteGroup = {
	key: string
	title: string
	pages: SitePage[]
}

const SITE_GROUPS: readonly SiteGroup[] = [
	{
		key: 'main',
		title: 'Основное',
		pages: [
			{ href: '/dashboard', title: 'Дашборд', description: 'Сводка, график результатов и последние попытки.' },
			{ href: '/tests', title: 'Тесты', description: 'Доступные тесты по темам.' },
			{ href: '/profile', title: 'Профиль', description: 'Личные данные и аватар.' },
		],
	},
	{
		key: 'admin',
		title: 'Администрирование',
		pages: [
			{ href: '/admin', title: 'Админка', description: 'Все разделы управления на одном экране.' },
			{ href: '/admin/attempts', title: 'Попытки', description: 'Журнал прохождений и разбор ответов.' },
			{ href: '/admin/users', title: 'Пользователи', description: 'Аккаунты, роли и приглашения.' },
			{ href: '/admin/groups', title: 'Группы', description: 'Учебные группы и их состав.' },
		],
	},
	{
		key: 'bank',
		title: 'Банк заданий',
		pages: [
			{ href: '/admin/tests', title: 'Темы и тесты', description: 'Темы, тесты и вопросы.' },
			{
				href: '/admin/tests/new',
				title: 'Новый тест',
				description: 'Создание теста с вопросами.',
				requires: 'tests.write',
			},
			{ href: '/admin/tests/question-types', title: 'Типы вопросов', description: 'Шаблоны и настройки типов.' },
			{ href: '/admin/tests/scoring', title: 'Настройка баллов', description: 'Баллы за типы вопросов.' },
		],
	},
	{
		key: 'settings',
		title: 'Настройки',
		pages: [
			{ href: '/admin/settings', title: 'Настройки', description: 'Системные параметры.' },
			{ href: '/admin/settings/rbac', title: 'Права доступа', description: 'Роли и разрешения.' },
			{
				href: '/admin/settings/chart',
				title: 'Диапазон графика',
				description: 'Период графика результатов по умолчанию.',
			},
			{ href: '/admin/sidebar', title: 'Боковое меню', description: 'Пункты меню и их порядок.' },
		],
	},
]

export function canOpenSitePage(perms: ReadonlySet<PermissionKey>, page: SitePage): boolean {
	const section = sectionForPath(page.href)
	if (section && !canAccessSection(perms, section)) return false
	return page.requires ? can(perms, page.requires) : true
}

export function visibleSiteMap(perms: ReadonlySet<PermissionKey>): SiteGroup[] {
	return SITE_GROUPS.map((group) => ({
		...group,
		pages: group.pages.filter((page) => canOpenSitePage(perms, page)),
	})).filter((group) => group.pages.length > 0)
}

export function allSitePages(): SitePage[] {
	return SITE_GROUPS.flatMap((group) => group.pages)
}
