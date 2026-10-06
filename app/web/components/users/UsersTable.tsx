'use client'

import { roleDisplayName } from '@bio-exam/rbac'

import { useState, type ReactNode } from 'react'

import { Link as LinkIcon, MoreHorizontal, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useSWRConfig } from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { SortableHead } from '@/components/table/SortableHead'
import { TableCard } from '@/components/table/TableCard'
import { useRowLink } from '@/components/table/use-row-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { highlightText } from '@/lib/search/highlight'
import { usersKeys } from '@/lib/users/api'
import { groupsCell, groupsTitle, showReinvite } from '@/lib/users/invite-form'
import { personName } from '@/lib/users/person-name'
import { nextUsersSort, type UsersSort, type UsersSortKey } from '@/lib/users/users-url'
import { cn } from '@/lib/utils/cn'
import { formatDay } from '@/lib/utils/dates'
import { sortDirectionOf } from '@/lib/utils/table-sort'
import type { UserRow } from '@/types/users'

import { EditUserDialog } from './dialogs/EditUserDialog'
import { ReinviteUserDialog } from './dialogs/ReinviteUserDialog'

type Props = {
	rows: UserRow[]
	loading: boolean
	searchQuery: string
	sort: UsersSort
	onSortChange: (sort: UsersSort) => void
	rolesFilter: ReactNode
	groupsFilter: ReactNode
	statusFilter: ReactNode
}

function profileHref(user: UserRow): string {
	return user.login ? `/profile/${encodeURIComponent(user.login)}` : `/admin/users/${user.id}`
}

function Highlighted({ text, query }: { text: string; query: string }) {
	if (!query.trim()) return <>{text}</>
	return <span dangerouslySetInnerHTML={{ __html: highlightText(text, query) }} />
}

function FilterHead({ label, filter, className }: { label: string; filter: ReactNode; className: string }) {
	return (
		<TableHead className={className}>
			<span className="inline-flex items-center gap-1">
				{label}
				{filter}
			</span>
		</TableHead>
	)
}

export function UsersTable({
	rows,
	loading,
	searchQuery,
	sort,
	onSortChange,
	rolesFilter,
	groupsFilter,
	statusFilter,
}: Props) {
	const { mutate } = useSWRConfig()
	const { can } = useAuth()
	const rowLink = useRowLink()
	const canEdit = can('users', 'edit')
	const canInvite = can('users', 'invite')
	const zoneAll = can('zone', 'all')
	const [editOpen, setEditOpen] = useState(false)
	const [reinviteOpen, setReinviteOpen] = useState(false)
	const [currentUser, setCurrentUser] = useState<UserRow | null>(null)

	const allowReinvite = (user: UserRow) =>
		showReinvite({ isActive: Boolean(user.isActive), activatedAt: user.activatedAt }, { canInvite, zoneAll })
	const showActions = loading ? canEdit || canInvite : canEdit || rows.some(allowReinvite)

	const openEdit = (user: UserRow) => {
		setCurrentUser(user)
		setEditOpen(true)
	}

	const openReinvite = (user: UserRow) => {
		setCurrentUser(user)
		setReinviteOpen(true)
	}

	const afterChange = () => {
		void mutate(usersKeys.list())
	}

	const head = (label: string, key: UsersSortKey, className?: string, align?: 'left' | 'right') => (
		<SortableHead
			label={label}
			direction={sortDirectionOf(sort, key)}
			onSort={() => onSortChange(nextUsersSort(sort, key))}
			className={className}
			align={align}
		/>
	)

	return (
		<>
			<TableCard>
				<Table className="table-fixed">
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							{head('Пользователь', 'name', 'pl-4')}
							<FilterHead label="Роли" filter={rolesFilter} className="hidden w-44 tab:table-cell" />
							<FilterHead label="Группа" filter={groupsFilter} className="hidden w-48 lg:table-cell" />
							<FilterHead label="Статус" filter={statusFilter} className="hidden w-32 tab-sm:table-cell" />
							{head('Создан', 'created', 'hidden w-32 xl:table-cell', 'right')}
							<TableHead className="hidden w-44 xl:table-cell">Кем создан</TableHead>
							{showActions ? (
								<TableHead className="w-14 pr-3">
									<span className="sr-only">Действия</span>
								</TableHead>
							) : null}
						</TableRow>
					</TableHeader>
					<TableBody aria-busy={loading || undefined}>
						{loading
							? Array.from({ length: 5 }, (_, index) => (
									<TableRow key={index} className="hover:bg-transparent">
										<TableCell className="py-3 pl-4">
											<Skeleton className="h-4 w-40 max-w-full" />
											<Skeleton className="mt-1.5 h-3 w-24 max-w-full" />
										</TableCell>
										<TableCell className="hidden tab:table-cell">
											<Skeleton className="h-5 w-20 rounded-full" />
										</TableCell>
										<TableCell className="hidden lg:table-cell">
											<Skeleton className="h-4 w-24" />
										</TableCell>
										<TableCell className="hidden tab-sm:table-cell">
											<Skeleton className="h-5 w-20 rounded-full" />
										</TableCell>
										<TableCell className="hidden xl:table-cell">
											<Skeleton className="ml-auto h-4 w-20" />
										</TableCell>
										<TableCell className="hidden xl:table-cell">
											<Skeleton className="h-4 w-24" />
										</TableCell>
										{showActions ? (
											<TableCell className="pr-3">
												<Skeleton className="size-8 rounded-full" />
											</TableCell>
										) : null}
									</TableRow>
								))
							: rows.map((user) => {
									const href = profileHref(user)
									const name = personName(user)
									const login = user.login || '—'
									const active = Boolean(user.isActive)
									const statusText = active ? 'Активен' : 'Неактивен'
									const roleNames = user.roles.map((role) => roleDisplayName(role)).join(', ')
									const reinvite = allowReinvite(user)
									return (
										<TableRow key={user.id} className="cursor-pointer" {...rowLink(href)}>
											<TableCell className="py-3 pl-4">
												<Link
													href={href}
													className="font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
												>
													<Highlighted text={name} query={searchQuery} />
												</Link>
												<p className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground">
													<Highlighted text={login} query={searchQuery} />
													{roleNames ? <span className="tab:hidden"> · {roleNames}</span> : null}
													<span className="tab-sm:hidden"> · {statusText}</span>
												</p>
												{user.groups.length > 0 ? (
													<p
														className="mt-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground lg:hidden"
														title={groupsTitle(user.groups)}
													>
														{groupsCell(user.groups)}
													</p>
												) : null}
											</TableCell>
											<TableCell className="hidden tab:table-cell">
												{user.roles.length > 0 ? (
													<div className="flex flex-wrap gap-1.5">
														{user.roles.map((role) => (
															<Badge key={role} variant="secondary" className="rounded-full">
																{roleDisplayName(role)}
															</Badge>
														))}
													</div>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell
												className={cn(
													'hidden truncate lg:table-cell',
													user.groups.length === 0 && 'text-muted-foreground'
												)}
												title={groupsTitle(user.groups) || undefined}
											>
												{groupsCell(user.groups)}
											</TableCell>
											<TableCell className="hidden tab-sm:table-cell">
												<Badge variant={active ? 'default' : 'outline'} className="rounded-full">
													{statusText}
												</Badge>
											</TableCell>
											<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell">
												{formatDay(user.createdAt)}
											</TableCell>
											<TableCell className="hidden truncate text-muted-foreground xl:table-cell">
												{user.createdByName ?? '—'}
											</TableCell>
											{showActions ? (
												<TableCell className="pr-3">
													{canEdit || reinvite ? (
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	size="icon"
																	variant="ghost"
																	className="size-8 rounded-full"
																	aria-label={`Действия с пользователем ${user.login || name}`}
																>
																	<MoreHorizontal className="size-4" aria-hidden="true" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																{canEdit ? (
																	<DropdownMenuItem onSelect={() => openEdit(user)}>
																		<Pencil className="size-4" aria-hidden="true" />
																		Изменить профиль
																	</DropdownMenuItem>
																) : null}
																{reinvite ? (
																	<DropdownMenuItem onSelect={() => openReinvite(user)}>
																		<LinkIcon className="size-4" aria-hidden="true" />
																		Новая ссылка приглашения
																	</DropdownMenuItem>
																) : null}
															</DropdownMenuContent>
														</DropdownMenu>
													) : null}
												</TableCell>
											) : null}
										</TableRow>
									)
								})}
					</TableBody>
				</Table>
			</TableCard>

			<EditUserDialog open={editOpen} onOpenChange={setEditOpen} user={currentUser} onSaved={afterChange} />
			<ReinviteUserDialog
				open={reinviteOpen}
				onOpenChange={setReinviteOpen}
				user={currentUser}
				onIssued={afterChange}
			/>
		</>
	)
}
