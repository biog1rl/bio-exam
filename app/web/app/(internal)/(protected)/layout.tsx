export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>
}
