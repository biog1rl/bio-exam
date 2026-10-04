import { notFound } from 'next/navigation'
import 'server-only'

import { canAccessSection, type Section } from './route-permissions'
import { getServerMe, type ServerMe } from './server'

export async function requireSectionAccess(section: Section): Promise<ServerMe | null> {
	const me = await getServerMe()
	if (!me) return null
	if (!canAccessSection(new Set(me.perms), section)) notFound()
	return me
}
