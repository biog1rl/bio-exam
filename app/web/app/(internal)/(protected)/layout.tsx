import { getServerMe } from '@/lib/session/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
	await getServerMe()
	return <>{children}</>
}
