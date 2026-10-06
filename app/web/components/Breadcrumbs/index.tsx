'use client'

import { Fragment, useEffect, useState } from 'react'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
	ASYNC_LABEL_WAIT_MS,
	crumbsHidden,
	crumbTrail,
	fallbackCrumbLabel,
	staticCrumbLabel,
	waitsForAsyncLabel,
} from '@/lib/navigation/crumbs'
import { HOME_PATH } from '@/lib/navigation/paths'

import { useBreadcrumbs } from './BreadcrumbsContext'

const LABEL_CLASS = 'block max-w-40 truncate tab-sm:max-w-64'

export default function Breadcrumbs() {
	const { labels } = useBreadcrumbs()
	const pathname = usePathname() || '/'
	const [waitedFor, setWaitedFor] = useState<string | null>(null)

	useEffect(() => {
		const timer = setTimeout(() => setWaitedFor(pathname), ASYNC_LABEL_WAIT_MS)
		return () => clearTimeout(timer)
	}, [pathname])

	if (crumbsHidden(pathname)) return null

	const trail = crumbTrail(pathname)
	const items = trail.map((href, index) => {
		const known = labels[href] ?? staticCrumbLabel(href)
		const waiting = !known && waitedFor !== pathname && waitsForAsyncLabel(href)
		return { href, label: known ?? fallbackCrumbLabel(href), waiting, last: index === trail.length - 1 }
	})

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					{items.length === 0 ? (
						<BreadcrumbPage>Главная</BreadcrumbPage>
					) : (
						<BreadcrumbLink asChild>
							<Link href={HOME_PATH}>Главная</Link>
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>

				{items.map((item) => (
					<Fragment key={item.href}>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							{item.waiting ? (
								<BreadcrumbPage aria-label="Загрузка названия">
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								</BreadcrumbPage>
							) : item.last ? (
								<BreadcrumbPage className={LABEL_CLASS}>{item.label}</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<Link href={item.href} className={LABEL_CLASS}>
										{item.label}
									</Link>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
