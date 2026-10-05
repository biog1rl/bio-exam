import { SectionGate } from '@/components/auth/SectionGate'

export const metadata = { title: 'Права доступа' }

export default function RBACLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="rbac">{children}</SectionGate>
}
