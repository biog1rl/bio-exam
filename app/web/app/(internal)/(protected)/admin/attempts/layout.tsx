import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminAttemptsLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="attempts">{children}</SectionGate>
}
