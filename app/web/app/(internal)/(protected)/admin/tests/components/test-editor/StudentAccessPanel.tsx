import { useState, type ReactNode } from 'react'

import { format, isValid, parseISO } from 'date-fns'
import { Loader2, Search, UserMinus, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { UserStatus } from '@/lib/users/status-filter'
import { assignmentAction, studentRowSubtitle } from '@/lib/users/student-card'
import { cn } from '@/lib/utils/cn'

import type { StudentAssignment, UserItem } from './test-editor-types'
import { filterAssignments, studentName } from './test-editor-view'

function getUserDisplayName(user: UserItem) {
	const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
	return user.name || fullName || user.login || user.id
}

function assignedDate(value: string): string {
	const parsed = parseISO(value)
	return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : '—'
}

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
			<label className="relative block min-w-0 flex-1">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Имя или логин"
					aria-label="Поиск учеников"
					className="h-10 rounded-full bg-card pl-9"
				/>
			</label>
			<Popover open={open} onOpenChange={setOpen}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<Button size="icon" className="size-10 shrink-0 rounded-full" aria-label="Добавить ученика">
								<UserPlus className="size-4" aria-hidden="true" />
							</Button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent>Добавить ученика</TooltipContent>
				</Tooltip>
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
											const name = getUserDisplayName(user)
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
			<div className="flex flex-col items-center gap-2 rounded-4xl border border-dashed border-border bg-card/70 px-6 py-14 text-center">
				<p className="font-medium text-foreground">У теста пока нет учеников с доступом</p>
				<p className="text-sm text-muted-foreground">Добавьте их кнопкой справа от поиска.</p>
			</div>
		)
	}

	const rows = filterAssignments(studentAssignments, query, status)

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center gap-4 rounded-4xl border border-dashed border-border bg-card/70 px-6 py-14 text-center">
				<p className="text-muted-foreground">Никого не нашли с такими фильтрами.</p>
				<Button variant="outline" className="rounded-full" onClick={onResetFilters}>
					Сбросить фильтры
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm">
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
							const name = studentName(row)
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
											{statusText} · доступ с {assignedDate(row.assignedAt)}
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
										{assignedDate(row.assignedAt)}
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
			</div>
			{rows.length !== studentAssignments.length ? (
				<p className="px-3 text-xs text-muted-foreground" aria-live="polite">
					Показано {rows.length} из {studentAssignments.length}
				</p>
			) : null}
		</div>
	)
}
