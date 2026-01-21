import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getBaseUrl() {
	if (process.env.API_ORIGIN) return process.env.API_ORIGIN!
	const h = await headers()
	const proto = h.get('x-forwarded-proto') || 'http'
	const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
	return `${proto}://${host}`
}

async function getInitialMe() {
	const c = await cookies()
	const cookie = c.toString()
	const base = await getBaseUrl()
	const url = `${base.replace(/\/$/, '')}/api/auth/me`
	const res = await fetch(url, { headers: { cookie }, cache: 'no-store' })
	if (!res.ok) return null
	const j = await res.json().catch(() => null)
	if (!j?.ok || !j?.user?.id) return null
	return j.user // { id, login, roles, perms }
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
	const me = await getInitialMe()
	if (!me) redirect('/login')

	// AuthProvider уже есть в родительском layout (internal)/layout.tsx
	// Не оборачиваем повторно, чтобы избежать рассинхронизации состояния
	return <>{children}</>
}
