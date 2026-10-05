import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminSidebarLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="sidebar">{children}</SectionGate>
}
