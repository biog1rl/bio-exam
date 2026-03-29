import { NextRequest, NextResponse } from 'next/server'

import { getSessionCookieCandidates } from '@/lib/auth/sessionCookie'

const SESSION_COOKIE_CANDIDATES = getSessionCookieCandidates(process.env.SESSION_COOKIE_NAME)
const REFRESH_COOKIE_NAME = 'refresh_token'

const PUBLIC_PATHS = new Set(['/login'])
const PUBLIC_PREFIXES = ['/invite']

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) return true
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function proxy(req: NextRequest) {
	const { pathname, search } = req.nextUrl
	const hasSession = SESSION_COOKIE_CANDIDATES.some((cookieName) => Boolean(req.cookies.get(cookieName)?.value))
	const hasRefresh = Boolean(req.cookies.get(REFRESH_COOKIE_NAME)?.value)

	if (isPublicPath(pathname)) {
		return NextResponse.next()
	}

	if (hasSession || hasRefresh) return NextResponse.next()

	const loginUrl = new URL('/login', req.url)
	loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
	return NextResponse.redirect(loginUrl)
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads).*)'],
}
