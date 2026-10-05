import { Metadata } from 'next'

import { BankExplorer } from './components/bank/BankExplorer'

export const metadata: Metadata = { title: 'Банк заданий' }

export default function TestsPage() {
	return <BankExplorer />
}
