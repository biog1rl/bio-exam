import { cache } from 'react'

import { cookies } from 'next/headers'
import 'server-only'

import { parseAuthMe, type AuthMe } from '@/lib/auth/authMePayload'

import { requireApiOrigin } from './api-origin'

export type ServerMe = AuthMe

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	const url = new URL('/api/auth/me', requireApiOrigin())
	const cookieStore = await cookies()
	const response = await fetch(url, {
		headers: { cookie: cookieStore.toString() },
		cache: 'no-store',
		redirect: 'error',
	})
	if (response.status === 401) return null
	if (!response.ok) throw new Error(`GET /api/auth/me failed with status ${response.status}`)
	const body: unknown = await response.json()
	return parseAuthMe(body)
})
