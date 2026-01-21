import AuthGuard from '@/components/auth/AuthGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	return <AuthGuard requireAny={['rbac.read', 'rbac.write']}>{children}</AuthGuard>
}
