const PUBLIC_PREFIXES = ['/login', '/invite']
const ANONYMOUS_PAGES = ['/photo-upload']

export const ANONYMOUS_PAGE_HEADER = 'x-bio-anonymous-page'

function pathOnly(path: string): string {
	return path.split(/[?#]/, 1)[0] ?? ''
}

export function isAnonymousPage(path: string): boolean {
	return ANONYMOUS_PAGES.includes(pathOnly(path))
}

export function isPublicPath(path: string): boolean {
	const pathname = pathOnly(path)
	if (ANONYMOUS_PAGES.includes(pathname)) return true
	return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
