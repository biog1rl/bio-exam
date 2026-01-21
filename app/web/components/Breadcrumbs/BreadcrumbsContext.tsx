'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type BreadcrumbsContextType = {
	labels: Record<string, string>
	setLabels: (labels: Record<string, string>) => void
}

const BreadcrumbsContext = createContext<BreadcrumbsContextType | undefined>(undefined)

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
	const [labels, setLabels] = useState<Record<string, string>>({})

	return <BreadcrumbsContext.Provider value={{ labels, setLabels }}>{children}</BreadcrumbsContext.Provider>
}

export function useBreadcrumbs() {
	const context = useContext(BreadcrumbsContext)
	if (!context) {
		// Возвращаем пустой объект если Provider не найден (fallback)
		return { labels: {}, setLabels: () => {} }
	}
	return context
}
