import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminQuestionTypesLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="catalog">{children}</SectionGate>
}
