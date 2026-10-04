import { can, type PermissionKey } from '@bio-exam/rbac'

import { canAccessSection, type Section } from '@/lib/session/route-permissions'

export type AdminCardKey = 'tests' | 'users' | 'groups' | 'settings' | 'attempts'

export type AdminCard = {
	key: AdminCardKey
	section: Section
	href: string
	kicker: string
	title: string
	description: string
	meta: string
}

type AdminCardSource = AdminCard & { teacherDescription?: string }

export type ServiceLinkKey = 'rbac' | 'chart' | 'sidebar'

export type ServiceLink = {
	key: ServiceLinkKey
	section: Section
	href: string
	label: string
}

export const ADMIN_HERO_TEXT =
	'Разделы администрирования собраны в одном рабочем контуре: контент экзамена, пользователи, группы и системные настройки.'

export const TEACHER_HERO_TEXT = 'Ваша зона: закреплённые темы, ваши группы и их ученики.'

const ADMIN_CARDS: readonly AdminCardSource[] = [
	{
		key: 'tests',
		section: 'tests',
		href: '/admin/tests',
		kicker: 'банк заданий',
		title: 'Тесты',
		description: 'Темы, тесты, вопросы и правила оценивания.',
		teacherDescription: 'Тесты и вопросы закреплённых за вами тем.',
		meta: 'контент и оценивание',
	},
	{
		key: 'users',
		section: 'users',
		href: '/admin/users',
		kicker: 'доступы',
		title: 'Пользователи',
		description: 'Аккаунты студентов, преподавателей и администраторов.',
		teacherDescription: 'Ученики ваших групп и приглашение новых.',
		meta: 'роли и профили',
	},
	{
		key: 'groups',
		section: 'groups',
		href: '/admin/groups',
		kicker: 'когорты',
		title: 'Группы',
		description: 'Учебные группы и состав участников.',
		teacherDescription: 'Ваши учебные группы и их состав.',
		meta: 'назначения',
	},
	{
		key: 'settings',
		section: 'settings',
		href: '/admin/settings',
		kicker: 'система',
		title: 'Настройки',
		description: 'RBAC, графики и параметры внутренних разделов.',
		meta: 'конфигурация',
	},
	{
		key: 'attempts',
		section: 'attempts',
		href: '/admin/attempts',
		kicker: 'результаты',
		title: 'Попытки',
		description: 'Журнал прохождений, баллы и переходы к разбору ответов.',
		teacherDescription: 'Попытки учеников по вашим темам и разбор ответов.',
		meta: 'контроль результатов',
	},
]

const SERVICE_LINKS: readonly ServiceLink[] = [
	{ key: 'rbac', section: 'rbac', href: '/admin/settings/rbac', label: 'RBAC' },
	{ key: 'chart', section: 'settings', href: '/admin/settings/chart', label: 'График' },
	{ key: 'sidebar', section: 'sidebar', href: '/admin/sidebar', label: 'Сайдбар' },
]

function hasZoneAll(perms: ReadonlySet<PermissionKey>): boolean {
	return can(perms, 'zone', 'all')
}

export function visibleAdminCards(perms: ReadonlySet<PermissionKey>): AdminCard[] {
	const teacherTexts = !hasZoneAll(perms)
	return ADMIN_CARDS.filter((card) => canAccessSection(perms, card.section)).map(({ teacherDescription, ...card }) => ({
		...card,
		description: teacherTexts && teacherDescription ? teacherDescription : card.description,
	}))
}

export function visibleServiceLinks(perms: ReadonlySet<PermissionKey>): ServiceLink[] {
	return SERVICE_LINKS.filter((link) => canAccessSection(perms, link.section))
}

export function adminHeroText(perms: ReadonlySet<PermissionKey>): string {
	return hasZoneAll(perms) ? ADMIN_HERO_TEXT : TEACHER_HERO_TEXT
}

export function sectionsCountLabel(count: number): string {
	if (count === 1) return `${count} активный раздел`
	if (count >= 2 && count <= 4) return `${count} активных раздела`
	return `${count} активных разделов`
}
