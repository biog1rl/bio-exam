import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminQuestionTypesLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('catalog')
	if (!me) return null
	return <>{children}</>
}
