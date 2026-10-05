export const HOME_PATH = '/dashboard'

const NON_PAGE_PATHS: readonly RegExp[] = [
	/^\/tests\/[^/]+$/,
	/^\/invite$/,
	/^\/admin\/tests\/[^/]+\/[^/]+\/questions$/,
	/^\/admin\/tests\/[^/]+\/[^/]+\/questions\/drafts$/,
]

const PARENT_OVERRIDES: ReadonlyArray<readonly [RegExp, string]> = [[/^\/profile\/[^/]+$/, '/admin/users']]

export function normalize(pathname: string): string {
	const path = pathname.split(/[?#]/)[0] || '/'
	return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function isPagePath(pathname: string): boolean {
	const path = normalize(pathname)
	return !NON_PAGE_PATHS.some((pattern) => pattern.test(path))
}

export function parentPagePath(pathname: string): string {
	const path = normalize(pathname)
	const override = PARENT_OVERRIDES.find(([pattern]) => pattern.test(path))
	if (override) return override[1]
	const segments = path.split('/').filter(Boolean)
	while (segments.length > 1) {
		segments.pop()
		const candidate = `/${segments.join('/')}`
		if (isPagePath(candidate)) return candidate
	}
	return HOME_PATH
}

export type BackAction = { kind: 'history' } | { kind: 'push'; href: string }

export function backAction(pathname: string, canGoBack: boolean): BackAction {
	return canGoBack ? { kind: 'history' } : { kind: 'push', href: parentPagePath(pathname) }
}
