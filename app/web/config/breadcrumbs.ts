export type RoutePattern = string | RegExp | ((path: string, parts: string[]) => boolean)

export const breadcrumbConfig = {
	/** где крошки вообще не показываем */
	hideOn: [/^\/auth(\/|$)/, /^\/login(\/|$)/, /^\/404$/] as RoutePattern[],

	/**
	 * Пути, где подписи сегментов приходят асинхронно (через SetBreadcrumbsLabels).
	 * Пока подпись не получена, показываем loader вместо slug/translit.
	 */
	asyncLabelOn: [
		/^\/tests\/[^/]+$/,
		/^\/tests\/[^/]+\/[^/]+$/,
		/^\/admin\/tests\/[^/]+$/,
		/^\/admin\/tests\/[^/]+\/[^/]+$/,
		/^\/admin\/tests\/question-types\/[^/]+$/,
	] as RoutePattern[],

	/** корневые сегменты, где крошки берут имена из дерева (segmentSlug → name) */
	treeRoots: ['editor'] as const,

	/** переопределения лейблов для сегментов */
	labelOverrides: {
		editor: 'Редактор',
		admin: 'Админка',
		dashboard: 'Дашборд',
		users: 'Пользователи',
		tests: 'Тесты',
		scoring: 'Настройка баллов',
		'question-types': 'Типы вопросов',
	} as Record<string, string>,

	/** скрыть технические сегменты в конкретных ветках */
	hideSegmentsOn: [
		{
			pattern: /^\/admin\/tests\/[^/]+\/[^/]+\/questions(\/|$)/,
			segments: ['questions', 'drafts', 'new'],
		},
	] as Array<{ pattern: RoutePattern; segments: string[] }>,
}

export function matchPath(patterns: RoutePattern[] | undefined, path: string, parts: string[]): boolean {
	if (!patterns || patterns.length === 0) return false
	return patterns.some((p) => {
		if (typeof p === 'string') return path.startsWith(p)
		if (p instanceof RegExp) return p.test(path)
		return p(path, parts)
	})
}
