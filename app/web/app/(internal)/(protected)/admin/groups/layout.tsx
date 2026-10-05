import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminGroupsLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="groups">{children}</SectionGate>
}
