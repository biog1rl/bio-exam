import type { Metadata } from 'next'

import { ChartSettingsPageClient } from './ChartSettingsPageClient'

export const metadata: Metadata = {
	title: 'Графики',
}

export default function ChartSettingsPage() {
	return <ChartSettingsPageClient />
}
