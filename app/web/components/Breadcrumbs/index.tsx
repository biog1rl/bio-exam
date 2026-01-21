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

/**
 * Узел дерева документов.
 * Ожидаем, что каждый узел знает свой slug (segmentSlug), отображаемое имя (name)
 * и может иметь дочерние элементы (children).
 */
type DocsNode = {
	segmentSlug: string
	name: string
	title?: string
	children?: DocsNode[]
}

/**
 * Унифицируем доступ к children: на вход может прийти сам узел, массив узлов или ничего.
 * Возвращаем всегда массив дочерних узлов (или пустой массив).
 */
function getChildren(nodeOrArray: DocsNode | DocsNode[] | null | undefined): DocsNode[] {
	if (!nodeOrArray) return []
	return Array.isArray(nodeOrArray) ? nodeOrArray : (nodeOrArray.children ?? [])
}

/**
 * Превращаем сегмент URL в «читаемый» заголовок:
 * - декодируем URI-компонент
 * - дефисы/подчёркивания → пробелы
 * - первая буква заглавная
 */
function humanize(segment: string) {
	try {
		segment = decodeURIComponent(segment)
	} catch {}
	segment = segment.replace(/[-_]+/g, ' ').trim()
	return segment.charAt(0).toUpperCase() + segment.slice(1)
}

/**
 * Безопасная версия decodeURIComponent, чтобы не падать на некорректных строках.
 */
function safeDecode(s: string) {
	try {
		return decodeURIComponent(s)
	} catch {
		return s
	}
}

/**
 * Компонент «Хлебные крошки».
 * - Поддерживает централизованный конфиг (скрывать крошки на отдельных страницах, переопределять лейблы и т.п.).
 * - Для роутов из списка treeRoots (например, /docs или /editor) берёт подписи из дерева документов (segmentSlug → name).
 * - Для остальных — использует labelOverrides → humanize.
 */
export default function Breadcrumbs({ initialLabels }: { initialLabels?: Record<string, string> }) {
	// Дерево документов больше не используется
	const tree = null
	const { labels: contextLabels } = useBreadcrumbs()

	// Объединяем labels из props и контекста (контекст имеет приоритет)
	const allLabels = { ...initialLabels, ...contextLabels }

	// Текущий путь и его сегменты
	const pathname = usePathname() || '/'
	const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
	const root = parts[0] // Корневой сегмент (/docs/..., /editor/..., /admin/...)

	// Централизованные настройки крошек
	const { hideOn, treeRoots, labelOverrides } = breadcrumbConfig

	// Превращаем сегменты в набор «пункт крошек» с href и флагом last
	const items = parts.map((seg, idx) => {
		const href = '/' + parts.slice(0, idx + 1).join('/')
		return { label: seg, href, last: idx === parts.length - 1 }
	})

	const shouldHide = matchPath(hideOn, pathname, parts)

	/**
	 * Строим карту соответствий href → «красивый лейбл» из дерева (name),
	 * но только если корень маршрута включён в treeRoots (например, docs или editor).
	 *
	 * Проход идёт «в глубину»: на каждом уровне ищем дочерний узел по segmentSlug.
	 * Как только не нашли — прекращаем маппинг и дальше используем humanize/overrides.
	 *
	 * useMemo: пересчитываем, когда меняется путь или дерево.
	 */
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

	// ----- ОЖИДАНИЕ «НОРМАЛЬНЫХ» ЛЕЙБЛОВ -----
	const isDocsRoot = !!root && treeRoots.includes(root as (typeof treeRoots)[number])
	const lastHref = items.length ? items[items.length - 1].href : undefined
	const hasInitial = lastHref ? allLabels?.[lastHref] !== undefined : false
	const hasTree = lastHref ? treeHrefToLabel.has(lastHref!) : false
	const hasReadyLabel = !!(hasInitial || hasTree)

	// ждём коротко (чтобы избежать мигания), затем — фолбэк из сегментов
	const WAIT_MS = 500
	const [waiting, setWaiting] = useState<boolean>(isDocsRoot && !hasReadyLabel)

	useEffect(() => {
		if (!isDocsRoot) {
			setWaiting(false)
			return
		}
		if (hasReadyLabel) {
			setWaiting(false)
			return
		}
		const t = setTimeout(() => setWaiting(false), WAIT_MS)
		return () => clearTimeout(t)
	}, [isDocsRoot, hasReadyLabel])

	if (shouldHide) {
		return null
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{/* Первый пункт — ссылка на главную (или просто текст, если мы уже на главной) */}
				<BreadcrumbItem>
					{items.length === 0 ? (
						<BreadcrumbPage>Главная</BreadcrumbPage>
					) : (
						<BreadcrumbLink asChild>
							<Link href="/">Главная</Link>
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>

				{/* Пока ждём «нормальную» метку для последнего пункта — показываем лоадер */}
				{waiting ? (
					<span className="flex items-center gap-x-2">
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>
								<LoaderComponent />
							</BreadcrumbPage>
						</BreadcrumbItem>
					</span>
				) : (
					/* Остальные пункты пути */
					items.map((item) => {
						const raw = item.label

						// Пытаемся взять красивый label из дерева (актуально для корней из treeRoots)
						const prettyFromTree =
							root && treeRoots.includes(root as (typeof treeRoots)[number])
								? treeHrefToLabel.get(item.href)
								: undefined

						// Если не нашли в дереве — пробуем allLabels, overrides, иначе humanize
						const pretty = allLabels?.[item.href] ?? prettyFromTree ?? labelOverrides[raw] ?? humanize(raw)

						return (
							<span key={item.href} className="flex items-center gap-x-2">
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									{item.last ? (
										// Последний пункт — текущая страница (без ссылки)
										<BreadcrumbPage>{pretty}</BreadcrumbPage>
									) : (
										// Промежуточные — кликабельные
										<BreadcrumbLink asChild>
											<Link href={item.href}>{pretty}</Link>
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>
							</span>
						)
					})
				)}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
