export type RoutePattern = string | RegExp

export const ASYNC_LABEL_WAIT_MS = 4000

export const breadcrumbConfig = {
	/** где крошки вообще не показываем */
	hideOn: [/^\/auth(\/|$)/, /^\/login(\/|$)/, /^\/404$/] as RoutePattern[],

	/**
	 * Пути, где подписи приходят асинхронно (через SetBreadcrumbsLabels).
	 * Пока подпись не получена, но не дольше ASYNC_LABEL_WAIT_MS, показываем loader вместо slug.
	 */
	asyncLabelOn: [
		/^\/tests\/[^/]+\/[^/]+$/,
		/^\/admin\/tests\/[^/]+$/,
		/^\/admin\/tests\/[^/]+\/[^/]+$/,
		/^\/admin\/tests\/question-types\/[^/]+$/,
		/^\/admin\/tests\/[^/]+\/[^/]+\/questions\/(?:drafts\/)?[^/]+$/,
	] as RoutePattern[],
}

export function matchPath(patterns: RoutePattern[] | undefined, path: string): boolean {
	if (!patterns || patterns.length === 0) return false
	return patterns.some((p) => (typeof p === 'string' ? path.startsWith(p) : p.test(path)))
}
