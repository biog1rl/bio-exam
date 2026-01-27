export type RoutePattern = string | RegExp | ((path: string, parts: string[]) => boolean)

export const breadcrumbConfig = {
	/** где крошки вообще не показываем */
	hideOn: [/^\/auth(\/|$)/, /^\/login(\/|$)/, /^\/404$/] as RoutePattern[],

	/** корневые сегменты, где крошки берут имена из дерева (segmentSlug → name) */
	treeRoots: ['editor'] as const,

	/** переопределения лейблов для сегментов */
	labelOverrides: {
		editor: 'Редактор',
		admin: 'Админка',
		dashboard: 'Дашборд',
		users: 'Пользователи',
		tests: 'Тесты',
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
