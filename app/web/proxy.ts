import { NextRequest, NextResponse } from 'next/server'

import { ANONYMOUS_PAGE_HEADER, isAnonymousPage, isPublicPath } from '@/lib/navigation/public-paths'
import { needsRefresh } from '@/lib/session/access-token'
import { expiredSessionCookies, readSessionCookieValue, REFRESH_COOKIE_NAME } from '@/lib/session/cookies'
import { refreshForProxy, SESSION_REFRESH_HEADER, SESSION_REFRESH_UNAVAILABLE } from '@/lib/session/proxy-refresh'
import { buildLoginRedirect } from '@/lib/session/redirect'

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
	headers.delete(ANONYMOUS_PAGE_HEADER)
	if (sessionRefresh) headers.set(SESSION_REFRESH_HEADER, sessionRefresh)
	return headers
}

function passThrough(req: NextRequest): NextResponse {
	if (!req.headers.has(SESSION_REFRESH_HEADER) && !req.headers.has(ANONYMOUS_PAGE_HEADER)) return NextResponse.next()
	return NextResponse.next({ request: { headers: forwardedHeaders(req) } })
}

function anonymousPage(req: NextRequest): NextResponse {
	const headers = forwardedHeaders(req)
	headers.set(ANONYMOUS_PAGE_HEADER, '1')
	return NextResponse.next({ request: { headers } })
}

export async function proxy(req: NextRequest) {
	if (isAnonymousPage(req.nextUrl.pathname)) return anonymousPage(req)

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
