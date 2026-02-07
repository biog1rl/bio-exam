import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_CANDIDATES = Array.from(
	new Set(
		[
			process.env.SESSION_COOKIE_NAME,
			'bio_exam_session', // default from server config
			'bio-exam_session', // value used in current server .env
		].filter((value): value is string => typeof value === 'string' && value.length > 0)
	)
)

const PUBLIC_PATHS = new Set(['/login'])
const PUBLIC_PREFIXES = ['/invite']

function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) return true
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function middleware(req: NextRequest) {
	const { pathname, search } = req.nextUrl
	const hasSession = SESSION_COOKIE_CANDIDATES.some((cookieName) => Boolean(req.cookies.get(cookieName)?.value))

	if (isPublicPath(pathname)) {
		return NextResponse.next()
	}

	if (hasSession) return NextResponse.next()

	const loginUrl = new URL('/login', req.url)
	loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
	return NextResponse.redirect(loginUrl)
}

export const config = {
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads).*)'],
}
