import { NextRequest, NextResponse } from 'next/server'

import { getSessionCookieCandidates, readSessionCookieValue } from '@/lib/auth/sessionCookie'
import { needsRefresh } from '@/lib/session/access-token'
import { refreshForProxy } from '@/lib/session/proxy-refresh'
import { buildLoginRedirect } from '@/lib/session/redirect'

const REFRESH_COOKIE_NAME = 'refresh_token'

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
	const names = [...getSessionCookieCandidates(process.env.SESSION_COOKIE_NAME), REFRESH_COOKIE_NAME]
	for (const name of names) {
		response.headers.append('set-cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`)
	}
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
			const response = NextResponse.next({ request: { headers: new Headers(req.headers) } })
			for (const line of outcome.setCookies) {
				response.headers.append('set-cookie', line)
			}
			return response
		}

		if (outcome.kind === 'rejected') {
			const response = isPublic ? NextResponse.next() : loginRedirect(req)
			clearSessionCookies(response)
			return response
		}

		return NextResponse.next()
	}

	if (isPublic) return NextResponse.next()

	if (accessToken || hasRefresh) return NextResponse.next()

	return loginRedirect(req)
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads).*)'],
}
