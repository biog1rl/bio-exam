import AuthGuard from '@/components/auth/AuthGuard'

const RBACLayout = ({ children }: { children: React.ReactNode }) => {
	return <AuthGuard requireAny={['rbac.read', 'rbac.write']}>{children}</AuthGuard>
}

export default RBACLayout
