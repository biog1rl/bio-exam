import { NextRequest, NextResponse } from 'next/server'

import { needsRefresh } from '@/lib/session/access-token'
import { expiredSessionCookies, readSessionCookieValue, REFRESH_COOKIE_NAME } from '@/lib/session/cookies'
import { refreshForProxy, SESSION_REFRESH_HEADER, SESSION_REFRESH_UNAVAILABLE } from '@/lib/session/proxy-refresh'
import { buildLoginRedirect } from '@/lib/session/redirect'

const PUBLIC_PATHS = new Set(['/login'])
const PUBLIC_PREFIXES = ['/invite']

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) return true
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function loginRedirect(req: NextRequest): NextResponse {
	const { pathname, search } = req.nextUrl
	return NextResponse.redirect(new URL(buildLoginRedirect(`${pathname}${search}`), req.url))
}

function clearSessionCookies(response: NextResponse): void {
	for (const cookie of expiredSessionCookies(process.env.SESSION_COOKIE_NAME)) {
		response.headers.append('set-cookie', cookie)
	}
}

function forwardedHeaders(req: NextRequest, sessionRefresh?: string): Headers {
	const headers = new Headers(req.headers)
	headers.delete(SESSION_REFRESH_HEADER)
	if (sessionRefresh) headers.set(SESSION_REFRESH_HEADER, sessionRefresh)
	return headers
}

function passThrough(req: NextRequest): NextResponse {
	if (!req.headers.has(SESSION_REFRESH_HEADER)) return NextResponse.next()
	return NextResponse.next({ request: { headers: forwardedHeaders(req) } })
}

export async function proxy(req: NextRequest) {
	const isPublic = isPublicPath(req.nextUrl.pathname)
	const accessToken = readSessionCookieValue(req.cookies, process.env.SESSION_COOKIE_NAME)
	const hasRefresh = Boolean(req.cookies.get(REFRESH_COOKIE_NAME)?.value)

	if (needsRefresh({ accessToken, hasRefresh, nowSec: Math.floor(Date.now() / 1000) })) {
		const outcome = await refreshForProxy({ cookieHeader: req.headers.get('cookie') ?? '' })

		if (outcome.kind === 'refreshed') {
			for (const [name, value] of Object.entries(outcome.values)) {
				req.cookies.set(name, value)
			}
			const response = NextResponse.next({ request: { headers: forwardedHeaders(req) } })
			for (const line of outcome.setCookies) {
				response.headers.append('set-cookie', line)
			}
			return response
		}

		if (outcome.kind === 'rejected') {
			const response = isPublic ? passThrough(req) : loginRedirect(req)
			clearSessionCookies(response)
			return response
		}

		return NextResponse.next({ request: { headers: forwardedHeaders(req, SESSION_REFRESH_UNAVAILABLE) } })
	}

	if (isPublic) return passThrough(req)

	if (accessToken || hasRefresh) return passThrough(req)

	return loginRedirect(req)
}

export const config = {
	matcher: [
		'/((?!api|_next/static|_next/image|favicon.ico|apple-icon.png|manifest.webmanifest|icons/|robots.txt|sitemap.xml|uploads).*)',
	],
}
