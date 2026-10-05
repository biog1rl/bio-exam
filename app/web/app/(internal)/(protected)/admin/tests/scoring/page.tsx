import { Metadata } from 'next'

import ScoringSettingsPageClient from './ScoringSettingsPageClient'

export const metadata: Metadata = { title: 'Настройка баллов' }

export default function ScoringSettingsPage() {
	return <ScoringSettingsPageClient />
}
