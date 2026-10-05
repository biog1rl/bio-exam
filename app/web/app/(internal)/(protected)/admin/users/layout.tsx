import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="users">{children}</SectionGate>
}
