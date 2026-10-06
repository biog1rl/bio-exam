import { PERMISSION_DOMAINS, type ActionOf, type PermissionDomain } from '@bio-exam/rbac'

export type PermissionLabel = { label: string; description: string }

export type PermissionActionView = PermissionLabel & { action: string }

export type PermissionDomainView = PermissionLabel & { domain: PermissionDomain; actions: PermissionActionView[] }

export const DOMAIN_LABELS: Record<PermissionDomain, PermissionLabel> = {
	users: { label: 'Пользователи', description: 'Учётные записи учеников и сотрудников' },
	rbac: { label: 'Права доступа', description: 'Права ролей и отдельных пользователей' },
	settings: { label: 'Настройки', description: 'Графики и ссылки в меню' },
	tests: { label: 'Тесты', description: 'Банк заданий, попытки и назначения' },
	groups: { label: 'Группы', description: 'Группы учеников' },
	zone: { label: 'Область работы', description: 'Только свои темы и группы или все сразу' },
}

export const ACTION_LABELS: { [D in PermissionDomain]: Record<ActionOf<D>, PermissionLabel> } = {
	users: {
		read: { label: 'Просмотр', description: 'Список пользователей и их профили' },
		edit: { label: 'Редактирование', description: 'Менять профили, роли и группы, удалять пользователей' },
		invite: { label: 'Приглашение', description: 'Создавать пользователей и выдавать ссылки-приглашения' },
		view_roles: { label: 'Просмотр ролей', description: 'Пока не используется: ни одна проверка его не читает' },
	},
	rbac: {
		read: { label: 'Просмотр', description: 'Открывать эту страницу и видеть права' },
		write: { label: 'Изменение', description: 'Менять права ролей и пользователей' },
	},
	settings: {
		manage: { label: 'Управление', description: 'Настраивать графики и ссылки в меню' },
	},
	tests: {
		read: { label: 'Просмотр', description: 'Банк заданий, попытки учеников и статистика' },
		write: { label: 'Редактирование', description: 'Создавать и менять тесты, вопросы и изображения' },
		manage_assignments: { label: 'Назначение', description: 'Назначать тесты ученикам и снимать назначения' },
	},
	groups: {
		manage_groups: { label: 'Управление группами', description: 'Создавать группы и менять их состав' },
	},
	zone: {
		all: {
			label: 'Все темы и ученики',
			description: 'Все темы, группы и ученики, а не только свои; типы вопросов и настройка баллов',
		},
	},
}

export const PERMISSION_VIEWS: readonly PermissionDomainView[] = (
	Object.keys(PERMISSION_DOMAINS) as PermissionDomain[]
).map((domain) => {
	const labels: Record<string, PermissionLabel> = ACTION_LABELS[domain]
	const actions: readonly string[] = PERMISSION_DOMAINS[domain].actions
	return { domain, ...DOMAIN_LABELS[domain], actions: actions.map((action) => ({ action, ...labels[action] })) }
})
