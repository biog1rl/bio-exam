import { useState, type ReactNode } from 'react'

import { Loader2, UserMinus, UserPlus } from 'lucide-react'

import { EmptyState } from '@/components/page/EmptyState'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { TableCard } from '@/components/table/TableCard'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { personName } from '@/lib/users/person-name'
import type { UserStatus } from '@/lib/users/status-filter'
import { assignmentAction, studentRowSubtitle } from '@/lib/users/student-card'
import { cn } from '@/lib/utils/cn'
import { formatDay } from '@/lib/utils/dates'

import type { StudentAssignment, UserItem } from './test-editor-types'
import { filterAssignments } from './test-editor-view'

interface StudentAccessToolbarProps {
	query: string
	onQueryChange: (query: string) => void
	statusFilter: ReactNode
	usersLoaded: boolean
	availableUsers: UserItem[]
	assigningUserId: string | null
	onAssignStudent: (userId: string) => void | Promise<void>
}

export function StudentAccessToolbar({
	query,
	onQueryChange,
	statusFilter,
	usersLoaded,
	availableUsers,
	assigningUserId,
	onAssignStudent,
}: StudentAccessToolbarProps) {
	const [open, setOpen] = useState(false)
	const candidates = [...availableUsers].sort((a, b) => Number(b.isActive) - Number(a.isActive))

	return (
		<div className="flex min-w-0 items-center gap-2 tab-sm:w-96">
			<div className="tab-sm:hidden">{statusFilter}</div>
			<ToolbarSearch
				value={query}
				onChange={onQueryChange}
				label="Поиск учеников"
				placeholder="Имя или логин"
				className="tab-sm:w-auto tab-sm:flex-1"
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<ToolbarTooltip label="Добавить ученика">
					<PopoverTrigger asChild>
						<ToolbarButton label="Добавить ученика" tone="primary">
							<UserPlus className="size-4" aria-hidden="true" />
						</ToolbarButton>
					</PopoverTrigger>
				</ToolbarTooltip>
				<PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
					<Command>
						<CommandInput placeholder="Имя или логин" aria-label="Найти ученика для добавления" />
						<CommandList>
							{!usersLoaded ? (
								<p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
									Загрузка учеников…
								</p>
							) : (
								<>
									<CommandEmpty>
										{availableUsers.length === 0 ? 'Все ученики уже с доступом' : 'Никого не нашли'}
									</CommandEmpty>
									<CommandGroup>
										{candidates.map((user) => {
											const name = personName(user, user.id)
											return (
												<CommandItem
													key={user.id}
													value={`${name} ${user.login ?? ''} ${user.id}`}
													onSelect={() => void onAssignStudent(user.id)}
													disabled={assigningUserId !== null}
												>
													{assigningUserId === user.id ? (
														<Loader2 className="size-4 animate-spin" aria-hidden="true" />
													) : (
														<UserPlus className="size-4" aria-hidden="true" />
													)}
													<span className="min-w-0 flex-1 truncate">{name}</span>
													{user.login && user.login !== name ? (
														<span className="text-xs text-muted-foreground">{user.login}</span>
													) : null}
													{user.isActive ? null : <span className="text-xs text-muted-foreground">неактивен</span>}
												</CommandItem>
											)
										})}
									</CommandGroup>
								</>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	)
}

interface StudentAccessPanelProps {
	assignmentsLoaded: boolean
	studentAssignments: StudentAssignment[]
	query: string
	status: UserStatus
	statusFilter: ReactNode
	removingUserId: string | null
	onRemoveStudent: (userId: string) => void | Promise<void>
	onResetFilters: () => void
}

export function StudentAccessPanel({
	assignmentsLoaded,
	studentAssignments,
	query,
	status,
	statusFilter,
	removingUserId,
	onRemoveStudent,
	onResetFilters,
}: StudentAccessPanelProps) {
	if (!assignmentsLoaded) {
		return <Skeleton className="h-64 rounded-3xl" aria-label="Загрузка доступа учеников" />
	}

	if (studentAssignments.length === 0) {
		return (
			<EmptyState title="У теста пока нет учеников с доступом" description="Добавьте их кнопкой справа от поиска." />
		)
	}

	const rows = filterAssignments(studentAssignments, query, status)

	if (rows.length === 0) {
		return (
			<EmptyState
				description="Никого не нашли с такими фильтрами."
				action={
					<Button variant="outline" className="rounded-full" onClick={onResetFilters}>
						Сбросить фильтры
					</Button>
				}
			/>
		)
	}

	return (
		<div className="space-y-2">
			<TableCard>
				<Table className="table-fixed">
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="pl-4">Ученик</TableHead>
							<TableHead className="hidden w-40 tab-sm:table-cell">
								<span className="inline-flex items-center gap-1">
									Статус
									{statusFilter}
								</span>
							</TableHead>
							<TableHead className="hidden w-32 text-right tab-sm:table-cell">Доступ с</TableHead>
							<TableHead className="w-14 pr-3">
								<span className="sr-only">Действия</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => {
							const name = personName(row, row.userId)
							const subtitle = studentRowSubtitle(row)
							const removing = removingUserId === row.userId
							const statusText = row.isActive ? 'Активен' : 'Неактивен'
							return (
								<TableRow key={row.userId}>
									<TableCell className="py-2.5 pl-4">
										<p
											className={cn(
												'font-medium [overflow-wrap:anywhere]',
												row.isActive ? 'text-foreground' : 'text-muted-foreground'
											)}
										>
											{name}
										</p>
										{subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
										<p className="text-xs text-muted-foreground tab-sm:hidden">
											{statusText} · доступ с {formatDay(row.assignedAt)}
										</p>
									</TableCell>
									<TableCell className="hidden whitespace-nowrap tab-sm:table-cell">
										<span className="inline-flex items-center gap-2">
											<span
												className={cn('size-2 rounded-full', row.isActive ? 'bg-primary' : 'bg-muted-foreground/50')}
												aria-hidden="true"
											/>
											<span className={row.isActive ? 'text-foreground' : 'text-muted-foreground'}>{statusText}</span>
										</span>
									</TableCell>
									<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
										{formatDay(row.assignedAt)}
									</TableCell>
									<TableCell className="pr-3">
										{assignmentAction(row) === 'remove' ? (
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														size="icon"
														variant="ghost"
														className="size-8 rounded-full text-muted-foreground hover:text-destructive"
														aria-label={`Убрать доступ: ${name}`}
														onClick={() => onRemoveStudent(row.userId)}
														disabled={removing}
													>
														{removing ? (
															<Loader2 className="size-4 animate-spin" aria-hidden="true" />
														) : (
															<UserMinus className="size-4" aria-hidden="true" />
														)}
													</Button>
												</TooltipTrigger>
												<TooltipContent>Убрать доступ</TooltipContent>
											</Tooltip>
										) : null}
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</TableCard>
			{rows.length !== studentAssignments.length ? (
				<p className="px-3 text-xs text-muted-foreground" aria-live="polite">
					Показано {rows.length} из {studentAssignments.length}
				</p>
			) : null}
		</div>
	)
}
