'use client'

import { Fragment, useEffect, useState } from 'react'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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

	const ancestors = [
		{ href: HOME_PATH, label: 'Главная' },
		...items.slice(0, -1).map(({ href, label }) => ({ href, label })),
	]

	return (
		<Breadcrumb className="min-w-0">
			<BreadcrumbList>
				<BreadcrumbItem className={items.length === 0 ? undefined : 'hidden tab-sm:inline-flex'}>
					{items.length === 0 ? (
						<BreadcrumbPage>Главная</BreadcrumbPage>
					) : (
						<BreadcrumbLink asChild>
							<Link href={HOME_PATH}>Главная</Link>
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>

				{items.length > 0 ? (
					<BreadcrumbItem className="tab-sm:hidden">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 rounded-full"
									aria-label={`Путь: ${ancestors.map((crumb) => crumb.label).join(', ')}`}
								>
									<BreadcrumbEllipsis />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{ancestors.map((crumb) => (
									<DropdownMenuItem key={crumb.href} asChild>
										<Link href={crumb.href}>{crumb.label}</Link>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</BreadcrumbItem>
				) : null}

				{items.map((item) => (
					<Fragment key={item.href}>
						<BreadcrumbSeparator className={item.last ? undefined : 'hidden tab-sm:flex'} />
						<BreadcrumbItem className={item.last ? 'min-w-0' : 'hidden tab-sm:inline-flex'}>
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
