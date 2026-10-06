'use client'

import { useMemo, useRef, useState } from 'react'

import { MoreHorizontal, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { DeleteGroupDialog } from '@/components/groups/DeleteGroupDialog'
import { GroupSheet } from '@/components/groups/GroupSheet'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { useAuth } from '@/components/providers/AuthProvider'
import { SortableHead } from '@/components/table/SortableHead'
import { TableCard } from '@/components/table/TableCard'
import { useRowLink } from '@/components/table/use-row-link'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupsKeys, groupsListFetcher, type Group } from '@/lib/groups/api'
import { TEACHER_GROUPS_EMPTY, ownerLabel } from '@/lib/groups/group-form'
import {
	filterGroups,
	groupsEmptyState,
	groupsSearch,
	nextGroupsSort,
	parseGroupsUrl,
	sortGroups,
	type GroupsSortKey,
	type GroupsUrlState,
} from '@/lib/groups/groups-table'
import { usersUrl } from '@/lib/users/users-url'
import { sortDirectionOf } from '@/lib/utils/table-sort'

export default function GroupsClient() {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const { data, error, mutate } = useSWR(groupsKeys.list(), groupsListFetcher)
	const titleRef = useRef<HTMLHeadingElement>(null)
	const searchParams = useSearchParams()
	const rowLink = useRowLink()
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editTarget, setEditTarget] = useState<Group | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)

	const url = parseGroupsUrl(searchParams)
	const groups = useMemo(() => data?.groups ?? [], [data?.groups])
	const visible = sortGroups(filterGroups(groups, url.q), url.sort)
	const emptyState = groupsEmptyState({ zoneAll, groups: groups.length, search: url.q })
	const loadFailed = error !== undefined && data === undefined
	const pending = data === undefined

	const updateUrl = (patch: Partial<GroupsUrlState>) => {
		window.history.replaceState(null, '', `${window.location.pathname}${groupsSearch({ ...url, ...patch })}`)
	}

	const openCreate = () => {
		setEditTarget(null)
		setSheetOpen(true)
	}

	const openEdit = (group: Group) => {
		setEditTarget(group)
		setSheetOpen(true)
	}

	const head = (label: string, key: GroupsSortKey, className?: string, align?: 'left' | 'right') => (
		<SortableHead
			label={label}
			direction={sortDirectionOf(url.sort, key)}
			onSort={() => updateUrl({ sort: nextGroupsSort(url.sort, key) })}
			className={className}
			align={align}
		/>
	)

	return (
		<div className="space-y-4">
			<PageHeader title="Группы" titleRef={titleRef}>
				<ToolbarSearch
					value={url.q}
					onChange={(q) => updateUrl({ q })}
					label="Поиск групп"
					placeholder="Название группы"
				/>
				<ToolbarTooltip label="Создать группу">
					<ToolbarButton tone="primary" label="Создать группу" onClick={openCreate}>
						<Plus className="size-4" aria-hidden="true" />
					</ToolbarButton>
				</ToolbarTooltip>
			</PageHeader>

			{loadFailed ? (
				<LoadErrorAlert
					title="Не удалось загрузить группы"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			) : !pending && emptyState === 'teacher-empty' ? (
				<EmptyState
					description={TEACHER_GROUPS_EMPTY}
					action={
						<Button className="rounded-full" onClick={openCreate}>
							<Plus className="size-4" aria-hidden="true" />
							Создать группу
						</Button>
					}
				/>
			) : !pending && groups.length === 0 ? (
				<EmptyState description="Групп пока нет" />
			) : !pending && visible.length === 0 ? (
				<EmptyState
					description="Группы не найдены. Попробуйте изменить запрос."
					action={
						<Button variant="outline" className="rounded-full" onClick={() => updateUrl({ q: '' })}>
							Сбросить поиск
						</Button>
					}
				/>
			) : (
				<TableCard>
					<Table className="table-fixed">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								{head('Название', 'name', 'pl-4')}
								{zoneAll ? head('Владелец', 'owner', 'hidden w-56 tab-sm:table-cell') : null}
								{head('Участников', 'members', 'hidden w-36 mob:table-cell', 'right')}
								<TableHead className="w-14 pr-3">
									<span className="sr-only">Действия</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody aria-busy={pending || undefined}>
							{pending
								? Array.from({ length: 5 }, (_, index) => (
										<TableRow key={index} className="hover:bg-transparent">
											<TableCell className="py-3 pl-4">
												<Skeleton className="h-4 w-48 max-w-full" />
											</TableCell>
											{zoneAll ? (
												<TableCell className="hidden tab-sm:table-cell">
													<Skeleton className="h-4 w-32" />
												</TableCell>
											) : null}
											<TableCell className="hidden mob:table-cell">
												<Skeleton className="ml-auto h-4 w-8" />
											</TableCell>
											<TableCell className="pr-3">
												<Skeleton className="size-8 rounded-full" />
											</TableCell>
										</TableRow>
									))
								: visible.map((group) => {
										const href = usersUrl(group.id)
										const owner = ownerLabel(group.owner)
										return (
											<TableRow key={group.id} className="cursor-pointer" {...rowLink(href)}>
												<TableCell className="py-3 pl-4">
													<Link
														href={href}
														className="font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
													>
														{group.name}
													</Link>
													{zoneAll ? (
														<p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground tab-sm:hidden">
															{owner}
															<span className="mob:hidden"> · участников: {group.memberCount}</span>
														</p>
													) : (
														<p className="mt-0.5 text-xs text-muted-foreground mob:hidden">
															участников: {group.memberCount}
														</p>
													)}
												</TableCell>
												{zoneAll ? (
													<TableCell className="hidden truncate text-muted-foreground tab-sm:table-cell">
														{owner}
													</TableCell>
												) : null}
												<TableCell className="hidden text-right tabular-nums mob:table-cell">
													{group.memberCount}
												</TableCell>
												<TableCell className="pr-3">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																size="icon"
																variant="ghost"
																className="size-8 rounded-full"
																aria-label={`Действия с группой ${group.name}`}
															>
																<MoreHorizontal className="size-4" aria-hidden="true" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem asChild>
																<Link href={href}>
																	<UsersRound className="size-4" aria-hidden="true" />
																	Ученики группы
																</Link>
															</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => openEdit(group)}>
																<Pencil className="size-4" aria-hidden="true" />
																Изменить группу
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="text-destructive focus:text-destructive"
																onSelect={() => setDeleteTarget(group)}
															>
																<Trash2 className="size-4" aria-hidden="true" />
																Удалить группу
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										)
									})}
						</TableBody>
					</Table>
				</TableCard>
			)}

			<GroupSheet open={sheetOpen} onOpenChange={setSheetOpen} group={editTarget} onSaved={() => mutate()} />
			<DeleteGroupDialog
				group={deleteTarget}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null)
				}}
				onDeleted={() => mutate()}
			/>
		</div>
	)
}
