'use client'

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

import { useEffect, useMemo, useRef, useState } from 'react'

import { BookOpen, ClipboardCheck, FileQuestion, FolderOpen, UserIcon, UsersIcon } from 'lucide-react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useRouter } from 'next/navigation'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { DialogTitle, DialogDescription, Dialog, DialogContent } from '@/components/ui/dialog'
import { searchAll } from '@/lib/search/api'
import { makeSearchValue } from '@/lib/search/query'
import type { SearchCategory, SearchResponse, SearchResultItem, SearchScope } from '@/types/search'

import { useSearch } from './SearchProvider'

type TabScope = SearchScope

const TAB_LABELS: Record<TabScope, string> = {
	all: 'Все',
	tests: 'Тесты',
	questions: 'Вопросы',
	users: 'Пользователи',
	groups: 'Группы',
	attempts: 'Попытки',
}

const TYPE_ICONS = {
	topic: FolderOpen,
	test: BookOpen,
	question: FileQuestion,
	user: UserIcon,
	group: UsersIcon,
	attempt: ClipboardCheck,
} as const

const SCOPE_ICONS = {
	all: FolderOpen,
	tests: BookOpen,
	questions: FileQuestion,
	users: UserIcon,
	groups: UsersIcon,
	attempts: ClipboardCheck,
} as const

function splitMeta(value: string): string[] {
	return value
		.split(' · ')
		.map((part) => part.trim())
		.filter(Boolean)
}

function MetaPill({ label, value }: { label: string; value: string }) {
	return (
		<span className="bg-muted/70 text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]">
			<span className="text-muted-foreground/70">{label}</span>
			<span className="truncate">{value}</span>
		</span>
	)
}

function ResultMeta({ item }: { item: SearchResultItem }) {
	const parts = splitMeta(item.subtitle)
	if (parts.length === 0) return null

	if (item.type === 'test') {
		const [topic, descriptionOrSlug, slug] = parts
		return (
			<div className="mt-1 flex min-w-0 flex-wrap gap-1">
				{topic && <MetaPill label="Тема" value={topic} />}
				{slug && descriptionOrSlug && <MetaPill label="Описание" value={descriptionOrSlug} />}
				<MetaPill label="Slug" value={slug ?? descriptionOrSlug} />
			</div>
		)
	}

	if (item.type === 'question') {
		const [topic, test, type] = parts
		return (
			<div className="mt-1 flex min-w-0 flex-wrap gap-1">
				{topic && <MetaPill label="Тема" value={topic} />}
				{test && <MetaPill label="Тест" value={test} />}
				{type && <MetaPill label="Тип" value={type} />}
			</div>
		)
	}

	return <div className="text-muted-foreground truncate text-xs">{item.subtitle}</div>
}

function ResultItem({ item, onSelect }: { item: SearchResultItem; onSelect: (href: string | null) => void }) {
	const Icon = TYPE_ICONS[item.type]
	const isAttempt = item.type === 'attempt'
	return (
		<CommandItem
			value={makeSearchValue(item.title, item.subtitle)}
			onSelect={() => onSelect(item.href)}
			className="cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors"
		>
			<div className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{item.title}</div>
				{isAttempt && item.snippetHtml ? (
					<div
						className="text-muted-foreground [&_mark]:bg-primary/20 [&_mark]:text-foreground truncate text-xs [&_mark]:rounded-[2px]"
						dangerouslySetInnerHTML={{ __html: item.snippetHtml }}
					/>
				) : (
					<ResultMeta item={item} />
				)}
				{!isAttempt && item.snippetHtml && (
					<div
						className="text-muted-foreground [&_mark]:bg-primary/20 [&_mark]:text-foreground mt-1 line-clamp-2 text-xs leading-relaxed [&_mark]:rounded-[2px]"
						dangerouslySetInnerHTML={{ __html: item.snippetHtml }}
					/>
				)}
			</div>
		</CommandItem>
	)
}

function CategoryResults({
	category,
	onSelect,
}: {
	category: SearchCategory
	onSelect: (href: string | null) => void
}) {
	if (!category.available || category.items.length === 0) return null
	return (
		<CommandGroup heading={category.title} className="[&_[cmdk-group-heading]]:px-3">
			{category.items.map((item) => (
				<ResultItem key={`${item.type}:${item.id}`} item={item} onSelect={onSelect} />
			))}
		</CommandGroup>
	)
}

export default function SearchDialog() {
	const { open, setOpen, closeDialog } = useSearch()
	const router = useRouter()

	const [tab, setTab] = useState<TabScope>('all')
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<SearchResponse | null>(null)
	const [loading, setLoading] = useState(false)

	const blur = useMotionValue(0)
	const blurSpring = useSpring(blur, { stiffness: 300, damping: 30 })
	const blurFilter = useTransform(blurSpring, (v) => `blur(${v}px)`)
	const openRef = useRef(open)

	useEffect(() => {
		openRef.current = open
	}, [open])

	useEffect(() => {
		if (!open) {
			setQuery('')
			setResults(null)
			setTab('all')
		}
	}, [open])

	useEffect(() => {
		const q = query.trim()
		if (q.length < 2) {
			setResults(null)
			setLoading(false)
			return
		}

		let cancelled = false
		const timer = setTimeout(async () => {
			if (!openRef.current) return
			setLoading(true)
			try {
				const response = await searchAll(q, 'all', 10)
				if (cancelled) return
				setResults(response)
				const visibleScopes = response.categories
					.filter((category) => category.available)
					.map((category) => category.scope)
				setTab((currentTab) => (currentTab !== 'all' && !visibleScopes.includes(currentTab) ? 'all' : currentTab))
			} catch {
				if (!cancelled) setResults({ query: q, categories: [], total: 0 })
			} finally {
				if (!cancelled) setLoading(false)
			}
		}, 300)

		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [query])

	useEffect(() => {
		blur.set(8)
		const timer = setTimeout(() => blur.set(0), 50)
		return () => clearTimeout(timer)
	}, [tab, blur])

	const availableCategories = useMemo(
		() => (results?.categories ?? []).filter((category) => category.available),
		[results]
	)
	const visibleTabs = useMemo<TabScope[]>(
		() => ['all', ...availableCategories.map((category) => category.scope)],
		[availableCategories]
	)
	const countsByScope = useMemo(() => {
		const counts = new Map<TabScope, number>()
		counts.set(
			'all',
			availableCategories.reduce((sum, category) => sum + category.items.length, 0)
		)
		for (const category of availableCategories) counts.set(category.scope, category.items.length)
		return counts
	}, [availableCategories])
	const selectedCategories = useMemo(() => {
		if (tab === 'all') return availableCategories
		return availableCategories.filter((category) => category.scope === tab)
	}, [availableCategories, tab])
	const hasResults = selectedCategories.some((category) => category.items.length > 0)

	const onSelect = (href: string | null) => {
		if (!href) return
		closeDialog()
		router.push(href)
	}

	const fadeVariants = {
		enter: { opacity: 0 },
		center: { opacity: 1 },
		exit: { opacity: 0 },
	} as const

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				forceMount
				className="tab-sm:p-0 [&>button]:bg-background/90 [&>button]:ring-border [&>button]:hover:bg-background w-[min(920px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-2xl border-none bg-transparent p-0 shadow-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:z-20 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:ring-1"
			>
				<Command
					shouldFilter={false}
					className="bg-background/95 h-[min(720px,calc(100dvh-2rem))] rounded-2xl border shadow-[0_24px_90px_rgba(34,45,24,0.22)] backdrop-blur-xl"
				>
					<DialogTitle>
						<VisuallyHidden>Поиск</VisuallyHidden>
					</DialogTitle>
					<DialogDescription>
						<VisuallyHidden>Начните печатать. ↑/↓ — навигация, Enter — открыть, Esc — закрыть.</VisuallyHidden>
					</DialogDescription>

					<div className="border-border/70 border-b px-4 pb-3 pt-4 sm:px-5">
						<div className="mb-3 flex items-center justify-between gap-4 pr-8">
							<div>
								<div className="text-sm font-semibold">Поиск</div>
								<div className="text-muted-foreground text-xs">Тесты, вопросы, пользователи и попытки</div>
							</div>
							{loading && <div className="text-muted-foreground animate-pulse text-xs">Ищем…</div>}
						</div>
						<div className="[&_[cmdk-input-wrapper]]:rounded-xl [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:bg-white/70 [&_[cmdk-input-wrapper]]:shadow-inner [&_[cmdk-input]]:h-11">
							<CommandInput placeholder="Введите запрос" value={query} onValueChange={setQuery} />
						</div>
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[210px_minmax(0,1fr)]">
						<aside className="border-border/70 overflow-x-auto border-b p-2 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
							<div className="flex gap-1 sm:flex-col">
								{visibleTabs.map((scope) => {
									const Icon = SCOPE_ICONS[scope]
									const count = countsByScope.get(scope) || 0
									const active = tab === scope
									return (
										<button
											key={scope}
											type="button"
											onClick={() => setTab(scope)}
											className={`flex min-w-32 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all active:scale-[0.99] sm:min-w-0 ${
												active
													? 'bg-primary/10 text-foreground shadow-sm'
													: 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
											}`}
										>
											<Icon className="size-4 shrink-0" />
											<span className="min-w-0 flex-1 truncate">{TAB_LABELS[scope]}</span>
											{loading && scope === 'all' ? (
												<span className="animate-pulse text-xs">…</span>
											) : count > 0 ? (
												<span className="bg-background/80 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums">
													{count}
												</span>
											) : null}
										</button>
									)
								})}
							</div>
						</aside>

						<div className="min-h-0 overflow-hidden">
							<CommandList className="h-full max-h-none min-h-0">
								{!loading && !hasResults && query.trim().length >= 2 && (
									<CommandEmpty>Ничего не найдено в разделе &quot;{TAB_LABELS[tab]}&quot;</CommandEmpty>
								)}
								{query.trim().length < 2 && <CommandEmpty>Введите минимум 2 символа для поиска</CommandEmpty>}

								<div className="min-h-full px-2 py-3 sm:px-3">
									<AnimatePresence initial={false} mode="wait">
										<motion.div
											key={tab}
											variants={fadeVariants}
											initial="enter"
											animate="center"
											exit="exit"
											transition={{ duration: 0.18, ease: 'easeInOut' }}
											style={{ filter: blurFilter }}
											className="space-y-2"
										>
											{selectedCategories.map((category) => (
												<CategoryResults key={category.scope} category={category} onSelect={onSelect} />
											))}
										</motion.div>
									</AnimatePresence>
								</div>
							</CommandList>
						</div>
					</div>
				</Command>
			</DialogContent>
		</Dialog>
	)
}
