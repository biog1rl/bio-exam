import 'server-only'
import { canAccessSection, type Section } from './route-permissions'
import { getServerMe, type ServerMe } from './server'

export type SectionAccess = { kind: 'anonymous' } | { kind: 'denied'; me: ServerMe } | { kind: 'allowed'; me: ServerMe }

export async function sectionAccess(section: Section): Promise<SectionAccess> {
	const me = await getServerMe()
	if (!me) return { kind: 'anonymous' }
	return canAccessSection(new Set(me.perms), section) ? { kind: 'allowed', me } : { kind: 'denied', me }
}
