import { cache } from 'react'

import { cookies } from 'next/headers'
import 'server-only'

import { absoluteUrl } from '@/lib/http/absoluteUrl'

import { parseAuthMe, type AuthMe } from './authMePayload'

export type ServerMe = AuthMe

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	try {
		const cookieStore = await cookies()
		const cookieHeader = cookieStore.toString()
		const url = await absoluteUrl('/api/auth/me')
		const response = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})
		const body = await response.json().catch(() => null)
		return parseAuthMe(body)
	} catch {
		return null
	}
})

export async function isAuthenticated(): Promise<boolean> {
	const me = await getServerMe()
	return Boolean(me)
}
