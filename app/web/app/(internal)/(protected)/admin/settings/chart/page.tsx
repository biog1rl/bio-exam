import type { Metadata } from 'next'

import { ChartSettingsPageClient } from './ChartSettingsPageClient'

export const metadata: Metadata = {
	title: 'Настройки графика',
}

export default function ChartSettingsPage() {
	return <ChartSettingsPageClient />
}
