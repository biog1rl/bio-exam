import type { ReactNode } from 'react'

import { HOME_PATH } from '@/lib/navigation/paths'
import type { Section } from '@/lib/session/route-permissions'
import { sectionAccess } from '@/lib/session/section-access'

import { AccessDeniedState } from './AccessDeniedState'

export function SectionDeniedState() {
	return (
		<div>
			<AccessDeniedState
				title="Нет доступа к разделу"
				description="У вашей учётной записи нет прав на этот раздел. Если доступ нужен для работы, обратитесь к администратору."
				backHref={HOME_PATH}
				backLabel="На главную"
			/>
		</div>
	)
}

export async function SectionGate({ section, children }: { section: Section; children: ReactNode }) {
	const access = await sectionAccess(section)
	if (access.kind === 'anonymous') return null
	if (access.kind === 'denied') return <SectionDeniedState />
	return <>{children}</>
}
