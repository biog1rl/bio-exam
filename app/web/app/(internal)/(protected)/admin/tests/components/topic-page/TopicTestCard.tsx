import { Download, FileText, MoreHorizontal, Pencil, Timer, Trash2 } from 'lucide-react'
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

import type { Test } from '../../types'
import { formatAdminTopicDate } from './topic-page-utils'

interface TopicTestCardProps {
	test: Test
	onExportTest: (test: Test, withAnswers: boolean) => void
	onDeleteTest: (test: Test) => void
}

export function TopicTestCard({ test, onExportTest, onDeleteTest }: TopicTestCardProps) {
	const editHref = `/admin/tests/${test.topicSlug}/${test.slug}`

	return (
		<article className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm transition-all duration-200">
			<div className="tab-sm:grid-cols-[1fr_auto] tab-sm:items-start grid gap-5">
				<Link href={editHref} className="group min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="group-hover:text-primary font-serif text-2xl leading-tight">{test.title}</h2>
						<Badge variant={test.isPublished ? 'default' : 'secondary'} className="rounded-full">
							{test.isPublished ? 'Опубликован' : 'Черновик'}
						</Badge>
					</div>
					{test.description ? (
						<p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">{test.description}</p>
					) : null}
				</Link>

				<div className="tab-sm:justify-end flex items-center justify-between gap-2">
					<Button asChild variant="outline" className="bg-card rounded-full">
						<Link href={editHref}>
							<Pencil className="size-4" />
							Редактировать
						</Link>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="rounded-full">
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onExportTest(test, false)}>
								<Download className="mr-2 size-4" />
								Экспорт
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onExportTest(test, true)}>
								<Download className="mr-2 size-4" />
								Экспорт с ответами
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => onDeleteTest(test)} className="text-destructive">
								<Trash2 className="mr-2 size-4" />
								Удалить
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<div className="text-muted-foreground mt-6 flex flex-wrap gap-2 text-sm">
				<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
					<FileText className="size-3.5" />
					{test.questionsCount ?? 0} вопросов
				</span>
				<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
					<Timer className="size-3.5" />
					{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : 'без таймера'}
				</span>
				<span className="bg-secondary/70 inline-flex rounded-full px-3 py-1">
					обновлен {formatAdminTopicDate(test.updatedAt)}
				</span>
			</div>
		</article>
	)
}
