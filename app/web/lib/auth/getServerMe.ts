import { cache } from 'react'

import 'server-only'

import { getMeData } from './server/getMeData'

export type ServerMe = Awaited<ReturnType<typeof getMeData>>

export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	try {
		return await getMeData()
	} catch {
		return null
	}
})

export async function isAuthenticated(): Promise<boolean> {
	const me = await getServerMe()
	return Boolean(me)
}
