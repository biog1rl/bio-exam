import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminTestsLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="tests">{children}</SectionGate>
}
