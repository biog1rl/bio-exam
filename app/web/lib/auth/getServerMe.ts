import { cache } from 'react'

import 'server-only'

import { getMeData } from '@/lib/auth/server/getMeData'

import { parseAuthMe, type AuthMe } from './authMePayload'

export type ServerMe = AuthMe

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	try {
		return parseAuthMe({ ok: true, user: await getMeData() })
	} catch {
		return null
	}
})

export async function isAuthenticated(): Promise<boolean> {
	const me = await getServerMe()
	return Boolean(me)
}
