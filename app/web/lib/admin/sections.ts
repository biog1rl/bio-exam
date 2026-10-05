import { can, type PermissionKey } from '@bio-exam/rbac'

export const ADMIN_HERO_TEXT =
	'Разделы управления собраны по группам: работа с тестами и учениками, каталог вопросов и системные настройки.'

export const TEACHER_HERO_TEXT = 'Ваша зона: закреплённые темы, ваши группы и их ученики.'

export function adminHeroText(perms: ReadonlySet<PermissionKey>): string {
	return can(perms, 'zone', 'all') ? ADMIN_HERO_TEXT : TEACHER_HERO_TEXT
}

export function sectionsCountLabel(count: number): string {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return `${count} раздел`
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} раздела`
	return `${count} разделов`
}
