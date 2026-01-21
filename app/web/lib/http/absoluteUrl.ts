import { headers } from 'next/headers'
import 'server-only'

/** Строит абсолютный URL для server-side fetch */
export async function absoluteUrl(path: string) {
	if (/^https?:\/\//i.test(path)) return path

	const h = await headers()

	const proto = h.get('x-forwarded-proto') ?? 'http'
	const host = h.get('x-forwarded-host') ?? h.get('host')

	const origin =
		(host ? `${proto}://${host}` : null) ??
		process.env.NEXT_PUBLIC_APP_ORIGIN ??
		process.env.APP_ORIGIN ??
		'http://localhost:3000'

	return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}
