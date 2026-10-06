import type { PermissionKey } from '@bio-exam/rbac'

import type { Metadata } from 'next'

import { sectionDescription, siteMapGroups } from '@/lib/navigation/sections'
import { getServerMe } from '@/lib/session/server'

import { SiteMapClient, type SiteMapGroup } from './SiteMapClient'

export const metadata: Metadata = { title: 'Карта сайта' }

export default async function SiteMapPage() {
	const me = await getServerMe()
	if (!me) return null

	const perms = new Set<PermissionKey>(me.perms)
	const groups: SiteMapGroup[] = siteMapGroups(perms).map((group) => ({
		key: group.key,
		title: group.title,
		tiles: group.sections.map((section) => ({
			href: section.href,
			title: section.title,
			icon: section.icon,
			description: sectionDescription(perms, section),
		})),
	}))

	return (
		<main>
			<SiteMapClient title="Карта сайта" groups={groups} />
		</main>
	)
}
