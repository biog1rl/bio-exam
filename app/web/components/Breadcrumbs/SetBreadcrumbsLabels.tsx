'use client'

import { useEffect } from 'react'

import { usePathname } from 'next/navigation'

import { useBreadcrumbs } from './BreadcrumbsContext'

type Props = {
	labels: Record<string, string>
}

/**
 * Клиентский компонент для установки breadcrumbs labels из серверного компонента.
 * Использует useEffect для установки labels в контекст после монтирования.
 */
export function SetBreadcrumbsLabels({ labels }: Props) {
	const { setLabels } = useBreadcrumbs()
	const pathname = usePathname()

	useEffect(() => {
		setLabels(labels)
	}, [labels, setLabels, pathname])

	return null
}
