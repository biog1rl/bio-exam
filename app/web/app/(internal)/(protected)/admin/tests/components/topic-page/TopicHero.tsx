import { Download, Edit, EyeOff, FileArchive, FlaskConical, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { topicHeroTeachersLine } from '@/lib/tests/bank-view'

import type { Topic } from '../../types'
import type { TopicStats } from './topic-page-utils'

interface TopicHeroProps {
	topic: Topic
	stats: TopicStats | null
	canManageCatalog: boolean
	onEditTopic: () => void
	onExportTopic: (withAnswers: boolean) => void
	onDeleteTopic: () => void
}

export function TopicHero({
	topic,
	stats,
	canManageCatalog,
	onEditTopic,
	onExportTopic,
	onDeleteTopic,
}: TopicHeroProps) {
	return (
		<section className="overflow-hidden rounded-4xl border border-border/80 bg-card/90 shadow-sm">
			<div className="grid gap-0 tab:grid-cols-[1fr_18.75rem]">
				<div className="p-unit-mob tab-sm:p-unit">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{topic.slug}</p>
						<Badge variant={topic.isActive ? 'default' : 'secondary'} className="rounded-full">
							{topic.isActive ? 'Активна' : 'Скрыта'}
						</Badge>
					</div>

					<div className="mt-5 max-w-4xl">
						<h1 className="font-serif text-4xl leading-none text-foreground tab-sm:text-5xl tab:text-7xl">
							{topic.title}
						</h1>
						<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
							{topic.description ||
								'Тема без описания. Добавьте короткую аннотацию, чтобы команда быстрее понимала контекст набора тестов.'}
						</p>
						{topic.teachers ? (
							<p className="mt-4 max-w-2xl text-sm break-words text-muted-foreground">
								{topicHeroTeachersLine(topic.teachers)}
							</p>
						) : null}
					</div>

					<div className="mt-8 flex flex-wrap gap-2">
						<Button asChild className="rounded-full transition-all">
							<Link href="/admin/tests/new">
								<Plus className="size-4" />
								Новый тест
							</Link>
						</Button>
						{canManageCatalog ? (
							<Button variant="outline" onClick={onEditTopic} className="rounded-full bg-card transition-all">
								<Edit className="size-4" />
								Тема
							</Button>
						) : null}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="rounded-full bg-card transition-all">
									<FileArchive className="size-4" />
									Экспорт
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => onExportTopic(false)}>
									<Download className="mr-2 size-4" />
									Без ответов
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onExportTopic(true)}>
									<Download className="mr-2 size-4" />С ответами
								</DropdownMenuItem>
								{canManageCatalog ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={onDeleteTopic} className="text-destructive">
											<Trash2 className="mr-2 size-4" />
											Удалить тему
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				<aside className="border-t border-border/70 bg-secondary/55 p-unit-mob tab-sm:p-unit tab:border-t-0 tab:border-l">
					<FlaskConical className="size-7 text-primary" />
					<p className="mt-6 font-serif text-4xl leading-none">{stats?.totalQuestions ?? '…'}</p>
					<p className="mt-2 text-sm text-muted-foreground">вопросов в теме</p>

					<div className="mt-8 space-y-3 text-sm">
						<div className="flex items-center justify-between gap-4 rounded-full bg-card px-4 py-2">
							<span className="text-muted-foreground">Опубликовано</span>
							<span className="font-medium">{stats?.publishedTests ?? '…'}</span>
						</div>
						<div className="flex items-center justify-between gap-4 rounded-full bg-card px-4 py-2">
							<span className="text-muted-foreground">Черновики</span>
							<span className="font-medium">{stats?.draftTests ?? '…'}</span>
						</div>
						{topic.isActive ? null : (
							<div className="flex items-center gap-2 rounded-3xl border border-border/70 bg-card px-4 py-3 text-muted-foreground">
								<EyeOff className="size-4 shrink-0" />
								<span>Тема скрыта в публичном каталоге.</span>
							</div>
						)}
					</div>
				</aside>
			</div>
		</section>
	)
}
