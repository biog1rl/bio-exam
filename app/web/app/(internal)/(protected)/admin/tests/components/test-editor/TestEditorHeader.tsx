import { ChevronDown, Download, Settings2 } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { attemptsUrl } from '@/lib/tests/attempts-url'

import { pointsLabel, questionsCountLabel } from './test-editor-view'

type TestRoute = { topicSlug: string; testSlug: string; topicTitle: string | null }

const RELATED_LINK_CLASS =
	'font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none'

interface TestEditorHeaderProps {
	title: string
	route: TestRoute | null
	questionCount: number
	totalPoints: number
	isEditingExisting: boolean
	isPublished: boolean
	timeLimitMinutes: number | null
	settingsDirty: boolean
	onPublishedChange: (isPublished: boolean) => void
	onExport: (withAnswers: boolean) => void
	onOpenSettings: () => void
}

export function TestEditorHeader({
	title,
	route,
	questionCount,
	totalPoints,
	isEditingExisting,
	isPublished,
	timeLimitMinutes,
	settingsDirty,
	onPublishedChange,
	onExport,
	onOpenSettings,
}: TestEditorHeaderProps) {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
			<div className="flex flex-col gap-5 tab:flex-row tab:items-start tab:justify-between">
				<div className="min-w-0">
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
						{isEditingExisting ? 'редактор теста' : 'создание теста'}
					</p>
					<h1 className="mt-2 max-w-3xl font-serif text-4xl leading-none break-words text-foreground tab-sm:text-5xl">
						{title || (isEditingExisting ? 'Редактирование теста' : 'Новый тест')}
					</h1>
					<p className="mt-3 text-sm text-muted-foreground">
						{questionsCountLabel(questionCount)} · {pointsLabel(totalPoints)}
						{timeLimitMinutes ? ` · ${timeLimitMinutes} мин` : ' · без таймера'}
					</p>
					{route ? (
						<nav aria-label="Связанные разделы" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
							<Link href={`/admin/tests/${route.topicSlug}`} className={RELATED_LINK_CLASS}>
								{route.topicTitle ? `Тема: ${route.topicTitle}` : 'Тема'}
							</Link>
							<Link href={attemptsUrl({ topic: route.topicSlug, status: 'all' })} className={RELATED_LINK_CLASS}>
								Попытки по теме
							</Link>
							{isPublished ? (
								<Link href={`/tests/${route.topicSlug}/${route.testSlug}`} className={RELATED_LINK_CLASS}>
									Как видит ученик
								</Link>
							) : null}
						</nav>
					) : null}
				</div>

				<div className="flex flex-wrap items-center gap-2 tab:justify-end">
					<label className="flex cursor-pointer items-center gap-3 rounded-full border border-border/70 bg-secondary/50 py-1.5 pr-2 pl-4 text-sm">
						<span className={isPublished ? 'font-medium text-foreground' : 'text-muted-foreground'}>
							{isPublished ? 'Опубликован' : 'Черновик'}
						</span>
						<Switch checked={isPublished} onCheckedChange={onPublishedChange} aria-label="Опубликовать тест" />
					</label>
					{isEditingExisting ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="secondary" className="rounded-full">
									<Download className="size-4" aria-hidden="true" />
									Экспорт
									<ChevronDown className="size-4" aria-hidden="true" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => onExport(false)}>Без ответов</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => onExport(true)}>С ответами</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="secondary"
								size="icon"
								className="relative rounded-full"
								onClick={onOpenSettings}
								aria-label="Настройки теста"
							>
								<Settings2 className="size-4" aria-hidden="true" />
								{settingsDirty ? (
									<span
										className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-secondary"
										aria-hidden="true"
									/>
								) : null}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Настройки теста</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</section>
	)
}
