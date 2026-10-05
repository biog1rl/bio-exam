import { SectionGate } from '@/components/auth/SectionGate'

export default function AdminChartSettingsLayout({ children }: { children: React.ReactNode }) {
	return <SectionGate section="settings">{children}</SectionGate>
}
