import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="admin">{children}</SectionGate>
}
