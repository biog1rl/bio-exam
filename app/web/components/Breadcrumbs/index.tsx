'use client'

import { useEffect, useMemo, useState } from 'react'

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
import { breadcrumbConfig, matchPath } from '@/config/breadcrumbs'

import LoaderComponent from '../LoaderComponent'
import { useBreadcrumbs } from './BreadcrumbsContext'

type DocsNode = {
	segmentSlug: string
	name: string
	title?: string
	children?: DocsNode[]
}

function getChildren(nodeOrArray: DocsNode | DocsNode[] | null | undefined): DocsNode[] {
	if (!nodeOrArray) return []
	return Array.isArray(nodeOrArray) ? nodeOrArray : (nodeOrArray.children ?? [])
}

function humanize(segment: string) {
	try {
		segment = decodeURIComponent(segment)
	} catch {}
	segment = segment.replace(/[-_]+/g, ' ').trim()
	return segment.charAt(0).toUpperCase() + segment.slice(1)
}

function safeDecode(s: string) {
	try {
		return decodeURIComponent(s)
	} catch {
		return s
	}
}

export default function Breadcrumbs({ initialLabels }: { initialLabels?: Record<string, string> }) {
	const tree = null
	const { labels: contextLabels } = useBreadcrumbs()

	const pathname = usePathname() || '/'
	const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
	const root = parts[0]
	const { hideOn, treeRoots, labelOverrides, asyncLabelOn, hideSegmentsOn } = breadcrumbConfig

	const hiddenSegments = useMemo(() => {
		const acc = new Set<string>()
		for (const rule of hideSegmentsOn ?? []) {
			if (matchPath([rule.pattern], pathname, parts)) {
				for (const segment of rule.segments) {
					acc.add(segment)
				}
			}
		}
		return acc
	}, [hideSegmentsOn, pathname, parts])

	const items = parts.map((seg, idx) => {
		const href = '/' + parts.slice(0, idx + 1).join('/')
		return { label: seg, href, last: idx === parts.length - 1 }
	})
	const filteredItems = items
		.filter((item) => !hiddenSegments.has(item.label))
		.map((item, idx, arr) => ({ ...item, last: idx === arr.length - 1 }))

	const shouldHide = matchPath(hideOn, pathname, parts)

	type StoreTree = DocsNode | DocsNode[] | null | undefined
	const treeHrefToLabel = useMemo(() => {
		const map = new Map<string, string>()

		if (!root || !treeRoots.includes(root as (typeof treeRoots)[number])) return map

		let level: DocsNode[] = getChildren(tree as StoreTree)

		for (let i = 1; i < parts.length; i++) {
			const seg = safeDecode(parts[i])
			const href = '/' + parts.slice(0, i + 1).join('/')

			const node = level.find((n) => safeDecode(n.segmentSlug) === seg)
			if (!node) break

			const displayName = node.title ?? node.name
			map.set(href, displayName)
			level = getChildren(node)
		}

		return map
	}, [parts, root, tree, treeRoots])

	const WAIT_MS = 1200
	const [allowFallback, setAllowFallback] = useState(false)

	useEffect(() => {
		setAllowFallback(false)
	}, [pathname])

	const displayItems = useMemo(() => {
		const allLabels = { ...initialLabels, ...contextLabels }

		return filteredItems.map((item) => {
			const raw = item.label
			const prettyFromTree =
				root && treeRoots.includes(root as (typeof treeRoots)[number]) ? treeHrefToLabel.get(item.href) : undefined
			const prettyFromLabels = allLabels?.[item.href]
			const prettyFromOverrides = labelOverrides[raw]
			const resolvedLabel = prettyFromLabels ?? prettyFromTree ?? prettyFromOverrides
			const itemParts = item.href.split('?')[0].split('#')[0].split('/').filter(Boolean)
			const shouldWaitForAsyncLabel = !resolvedLabel && matchPath(asyncLabelOn, item.href, itemParts)

			return {
				...item,
				pretty: resolvedLabel ?? humanize(raw),
				shouldShowLoader: shouldWaitForAsyncLabel && !allowFallback,
			}
		})
	}, [
		contextLabels,
		initialLabels,
		allowFallback,
		asyncLabelOn,
		filteredItems,
		labelOverrides,
		root,
		treeHrefToLabel,
		treeRoots,
	])

	const hasPendingAsyncLabels = displayItems.some((item) => item.shouldShowLoader)

	useEffect(() => {
		if (!hasPendingAsyncLabels) return
		const t = setTimeout(() => setAllowFallback(true), WAIT_MS)
		return () => clearTimeout(t)
	}, [hasPendingAsyncLabels])

	if (shouldHide) {
		return null
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					{filteredItems.length === 0 ? (
						<BreadcrumbPage>Главная</BreadcrumbPage>
					) : (
						<BreadcrumbLink asChild>
							<Link href="/">Главная</Link>
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>

				{displayItems.map((item) => (
					<span key={item.href} className="flex items-center gap-x-2">
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							{item.shouldShowLoader ? (
								<BreadcrumbPage>
									<LoaderComponent />
								</BreadcrumbPage>
							) : item.last ? (
								<BreadcrumbPage>{item.pretty}</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<Link href={item.href}>{item.pretty}</Link>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</span>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
