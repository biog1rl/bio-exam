'use client'

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { useRouter } from 'next/navigation'

import { Command, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { DialogTitle, DialogDescription, Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { searchTopics, searchFiles, searchUsers } from '@/lib/search/api'
import type { TopicResult, FileResult, UserResult } from '@/types/search'

import { useSearch } from './SearchProvider'
import { SearchResultsTopics } from './SearchResultsTopics'
import { SearchResultsFiles } from './SearchResultsFiles'
import { SearchResultsUsers } from './SearchResultsUsers'

export default function SearchDialog() {
	const { open, setOpen, closeDialog } = useSearch()
	const router = useRouter()

	const [tab, setTab] = useState<'topics' | 'files' | 'users'>('topics')
	const [query, setQuery] = useState('')

	// Motion values для blur эффекта
	const blur = useMotionValue(0)
	const blurSpring = useSpring(blur, { stiffness: 300, damping: 30 })
	const blurFilter = useTransform(blurSpring, (v) => `blur(${v}px)`)

	// Результаты поиска
	const [topics, setTopics] = useState<TopicResult[]>([])
	const [files, setFiles] = useState<FileResult[]>([])
	const [users, setUsers] = useState<UserResult[]>([])

	// Состояние загрузки
	const [loadingTopics, setLoadingTopics] = useState(false)
	const [loadingFiles, setLoadingFiles] = useState(false)
	const [loadingUsers, setLoadingUsers] = useState(false)

	const openRef = useRef(open)

	useEffect(() => {
		openRef.current = open
	}, [open])

	// Сброс при закрытии
	useEffect(() => {
		if (!open) {
			setQuery('')
			setTopics([])
			setFiles([])
			setUsers([])
		}
	}, [open])

	// Поиск с дебаунсом
	useEffect(() => {
		const q = query.trim()
		if (q.length < 2) {
			setTopics([])
			setFiles([])
			setUsers([])
			return
		}

		let cancelled = false
		const t = setTimeout(async () => {
			if (!openRef.current) return

			// Запускаем все поиски параллельно
			setLoadingTopics(true)
			setLoadingFiles(true)
			setLoadingUsers(true)

			try {
				const [topicsResults, filesResults, usersResults] = await Promise.all([
					searchTopics(q, 10),
					searchFiles(q, 10),
					searchUsers(q, 10),
				])

				if (!cancelled) {
					setTopics(topicsResults)
					setFiles(filesResults)
					setUsers(usersResults)
				}
			} finally {
				if (!cancelled) {
					setLoadingTopics(false)
					setLoadingFiles(false)
					setLoadingUsers(false)
				}
			}
		}, 300)

		return () => {
			cancelled = true
			clearTimeout(t)
		}
	}, [query])

	const canTopics = topics.length > 0
	const canFiles = files.length > 0
	const canUsers = users.length > 0

	const onSelect = (href: string | null) => {
		if (!href) return
		closeDialog()
		router.push(href)
	}

	// variants для fade эффекта
	const fadeVariants = {
		enter: { opacity: 0 },
		center: { opacity: 1 },
		exit: { opacity: 0 },
	} as const

	// Анимируем blur при смене таба
	useEffect(() => {
		blur.set(8)
		const timer = setTimeout(() => {
			blur.set(0)
		}, 50)
		return () => clearTimeout(timer)
	}, [tab, blur])

	const loading = useMemo(() => {
		if (tab === 'topics') return loadingTopics
		if (tab === 'files') return loadingFiles
		return loadingUsers
	}, [tab, loadingTopics, loadingFiles, loadingUsers])

	const hasResults = useMemo(() => {
		if (tab === 'topics') return canTopics
		if (tab === 'files') return canFiles
		return canUsers
	}, [tab, canTopics, canFiles, canUsers])

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent forceMount className="overflow-hidden p-0">
				<Command shouldFilter={false} className="rounded-lg border">
					{/* a11y */}
					<DialogTitle>
						<VisuallyHidden>Поиск</VisuallyHidden>
					</DialogTitle>
					<DialogDescription>
						<VisuallyHidden>Начните печатать. ↑/↓ — навигация, Enter — открыть, Esc — закрыть.</VisuallyHidden>
					</DialogDescription>

					<CommandInput placeholder="Поиск…" value={query} onValueChange={setQuery} />

					{/* Табы */}
					<div className="px-2 pt-2">
						<Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger value="topics" className={`cursor-pointer ${canTopics ? 'opacity-100' : 'opacity-60'}`}>
									Темы
									{loadingTopics ? (
										<span className="ml-2 inline-flex">
											<span className="animate-pulse">…</span>
										</span>
									) : canTopics ? (
										<span className="bg-muted ml-2 rounded px-1 text-[10px]">{topics.length}</span>
									) : null}
								</TabsTrigger>

								<TabsTrigger value="files" className={`cursor-pointer ${canFiles ? 'opacity-100' : 'opacity-60'}`}>
									Файлы
									{loadingFiles ? (
										<span className="ml-2 inline-flex">
											<span className="animate-pulse">…</span>
										</span>
									) : canFiles ? (
										<span className="bg-muted ml-2 rounded px-1 text-[10px]">{files.length}</span>
									) : null}
								</TabsTrigger>

								<TabsTrigger value="users" className={`cursor-pointer ${canUsers ? 'opacity-100' : 'opacity-60'}`}>
									Пользователи
									{loadingUsers ? (
										<span className="ml-2 inline-flex">
											<span className="animate-pulse">…</span>
										</span>
									) : canUsers ? (
										<span className="bg-muted ml-2 rounded px-1 text-[10px]">{users.length}</span>
									) : null}
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>

					{/* Вьюпорт результатов */}
					<CommandList className="min-h-75">
						{!loading && !hasResults && query.trim().length >= 2 && (
							<CommandEmpty>Ничего не найдено в разделе &quot;{tab === 'topics' ? 'Темы' : tab === 'files' ? 'Файлы' : 'Пользователи'}&quot;</CommandEmpty>
						)}

						{query.trim().length < 2 && (
							<CommandEmpty>Введите минимум 2 символа для поиска</CommandEmpty>
						)}

						<div className="relative h-full">
							<AnimatePresence initial={false} mode="wait">
								<motion.div
									key={tab}
									variants={fadeVariants}
									initial="enter"
									animate="center"
									exit="exit"
									transition={{ duration: 0.2, ease: 'easeInOut' }}
									style={{
										filter: blurFilter,
									}}
									className="absolute inset-0"
								>
									{tab === 'topics' && <SearchResultsTopics topics={topics} onSelect={onSelect} />}
									{tab === 'files' && <SearchResultsFiles files={files} onSelect={onSelect} />}
									{tab === 'users' && <SearchResultsUsers users={users} onSelect={onSelect} />}
								</motion.div>
							</AnimatePresence>
						</div>
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	)
}
