import { Download, Eye, History, MoreHorizontal, Settings2 } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { attemptsUrl } from '@/lib/tests/attempts-url'

import { pointsLabel, questionsCountLabel } from './test-editor-view'

type TestRoute = { topicSlug: string; testSlug: string }

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
		<PageHeader
			title={title || (isEditingExisting ? 'Редактирование теста' : 'Новый тест')}
			meta={`${questionsCountLabel(questionCount)} · ${pointsLabel(totalPoints)} · ${timeLimitMinutes ? `${timeLimitMinutes} мин` : 'без таймера'}`}
		>
			<label className="flex h-10 shrink-0 cursor-pointer items-center gap-3 rounded-full border border-border/80 bg-card pr-2 pl-4 text-sm">
				<span className={isPublished ? 'font-medium text-foreground' : 'text-muted-foreground'}>
					{isPublished ? 'Опубликован' : 'Черновик'}
				</span>
				<Switch checked={isPublished} onCheckedChange={onPublishedChange} aria-label="Опубликовать тест" />
			</label>
			{route ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<ToolbarButton label="Действия с тестом">
							<MoreHorizontal className="size-4" aria-hidden="true" />
						</ToolbarButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{isPublished ? (
							<DropdownMenuItem asChild>
								<Link href={`/tests/${route.topicSlug}/${route.testSlug}`}>
									<Eye className="size-4" aria-hidden="true" />
									Как видит ученик
								</Link>
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem asChild>
							<Link href={attemptsUrl({ topic: route.topicSlug, status: 'all' })}>
								<History className="size-4" aria-hidden="true" />
								Попытки по теме
							</Link>
						</DropdownMenuItem>
						{isEditingExisting ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => onExport(false)}>
									<Download className="size-4" aria-hidden="true" />
									Экспорт без ответов
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => onExport(true)}>
									<Download className="size-4" aria-hidden="true" />
									Экспорт с ответами
								</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			<ToolbarTooltip label="Настройки теста">
				<ToolbarButton label="Настройки теста" dot={settingsDirty} onClick={onOpenSettings}>
					<Settings2 className="size-4" aria-hidden="true" />
				</ToolbarButton>
			</ToolbarTooltip>
		</PageHeader>
	)
}
