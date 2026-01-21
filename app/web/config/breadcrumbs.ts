export type RoutePattern = string | RegExp | ((path: string, parts: string[]) => boolean)

export const breadcrumbConfig = {
	/** где крошки вообще не показываем */
	hideOn: [/^\/auth(\/|$)/, /^\/login(\/|$)/, /^\/404$/] as RoutePattern[],

	/** корневые сегменты, где крошки берут имена из дерева (segmentSlug → name) */
	treeRoots: ['docs', 'editor'] as const,

	/** переопределения лейблов для сегментов */
	labelOverrides: {
		docs: 'Документы',
		editor: 'Редактор',
		admin: 'Админка',
		projects: 'Проекты',
		dashboard: 'Дашборд',
		workload: 'Нагрузка',
		employees: 'Сотрудники',
		users: 'Пользователи',
	} as Record<string, string>,
}

export function matchPath(patterns: RoutePattern[] | undefined, path: string, parts: string[]): boolean {
	if (!patterns || patterns.length === 0) return false
	return patterns.some((p) => {
		if (typeof p === 'string') return path.startsWith(p)
		if (p instanceof RegExp) return p.test(path)
		return p(path, parts)
	})
}
