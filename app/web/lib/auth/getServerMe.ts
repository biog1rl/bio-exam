import { cache } from 'react'

import { cookies } from 'next/headers'
import 'server-only'

import { parseAuthMe, type AuthMe } from './authMePayload'

export type ServerMe = AuthMe

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	try {
		const apiOrigin = process.env.API_ORIGIN
		if (apiOrigin) {
			const cookieStore = await cookies()
			const response = await fetch(new URL('/api/auth/me', apiOrigin), {
				headers: { cookie: cookieStore.toString() },
				cache: 'no-store',
				redirect: 'error',
			})
			if (!response.ok) return null
			const body: unknown = await response.json()
			return parseAuthMe(body)
		}

		const { getMeData } = await import('@/lib/auth/server/getMeData')
		return parseAuthMe({ ok: true, user: await getMeData() })
	} catch {
		return null
	}
})

export async function isAuthenticated(): Promise<boolean> {
	const me = await getServerMe()
	return Boolean(me)
}
