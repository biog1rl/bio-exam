'use client'

import { useState, useEffect, useMemo } from 'react'

import { Check, ChevronsUpDown, X } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { UserStatusFilter } from '@/components/users/UserStatusFilter'
import {
	candidatesFetcher,
	groupDetailFetcher,
	groupsKeys,
	ownerOptionsFetcher,
	saveGroup,
	type Candidate,
	type Group,
} from '@/lib/groups/api'
import {
	ADMINS_OWNER_LABEL,
	CANDIDATES_EMPTY,
	CANDIDATES_ERROR,
	CANDIDATES_HINT,
	MIN_CANDIDATE_QUERY,
	OWNER_HINT,
	candidatesState,
	groupSaveDisabled,
	groupSaveErrorText,
	groupSavePayload,
	ownerLabel,
	personLabel,
} from '@/lib/groups/group-form'
import { swrFetcher } from '@/lib/http/swr'
import { usersKeys } from '@/lib/users/api'
import { matchesUserStatus, type UserStatus } from '@/lib/users/status-filter'
import { cn } from '@/lib/utils'
import type { UserRow } from '@/types/users'

export type GroupSheetGroup = Group

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	group: GroupSheetGroup | null
	onSaved: () => void
}

type Person = { label: string; isActive: boolean }

const ADMINS_OWNER = 'admins'
const SEARCH_DELAY_MS = 300

type UsersList = { rows: UserRow[]; total: number }

const displayName = (u: UserRow) => {
	const full = [u.firstName, u.lastName].filter(Boolean).join(' ')
	return full || u.name || u.login
}

export function GroupSheet({ open, onOpenChange, group, onSaved }: Props) {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')

	const [name, setName] = useState('')
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [people, setPeople] = useState<Record<string, Person>>({})
	const [comboOpen, setComboOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [statusFilter, setStatusFilter] = useState<UserStatus>('active')
	const [query, setQuery] = useState('')
	const [debouncedQuery, setDebouncedQuery] = useState('')
	const [ownerChoice, setOwnerChoice] = useState<string>(ADMINS_OWNER)

	const { data: usersData, error: usersError } = useSWR<UsersList>(zoneAll ? usersKeys.list() : null, swrFetcher)
	const usersFailed = zoneAll && usersError !== undefined && usersData === undefined
	const allUsers = useMemo(() => usersData?.rows ?? [], [usersData])
	const usersById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers])
	const visibleUsers = useMemo(
		() => allUsers.filter((user) => matchesUserStatus(user.isActive, statusFilter)),
		[allUsers, statusFilter]
	)

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DELAY_MS)
		return () => clearTimeout(timer)
	}, [query])

	const candidateQuery = debouncedQuery.trim()
	const candidatesKey =
		!zoneAll && open && candidateQuery.length >= MIN_CANDIDATE_QUERY ? groupsKeys.candidates(candidateQuery) : null
	const {
		data: candidatesData,
		error: candidatesError,
		isLoading: candidatesLoading,
	} = useSWR(candidatesKey, candidatesFetcher, { shouldRetryOnError: false })
	const candidates = useMemo(() => candidatesData?.users ?? [], [candidatesData])
	const searchState = candidatesState({
		query,
		debounced: debouncedQuery,
		loading: candidatesLoading,
		error: Boolean(candidatesError),
		count: candidates.length,
	})

	const { data: ownersData } = useSWR(zoneAll && open ? groupsKeys.ownerOptions() : null, ownerOptionsFetcher)
	const ownerOptions = useMemo(() => {
		const owners = ownersData?.owners ?? []
		const current = group?.owner
		if (current && !owners.some((o) => o.id === current.id)) return [current, ...owners]
		return owners
	}, [ownersData, group])

	const {
		data: groupData,
		error: membersError,
		isLoading: membersLoading,
	} = useSWR(open && group ? groupsKeys.detail(group.id) : null, groupDetailFetcher, { revalidateOnFocus: false })
	const membersFailed = Boolean(group) && membersError !== undefined && groupData === undefined

	useEffect(() => {
		if (!open) {
			setName('')
			setSelectedIds([])
			setPeople({})
			setComboOpen(false)
			setSaving(false)
			setStatusFilter('active')
			setQuery('')
			setDebouncedQuery('')
			setOwnerChoice(ADMINS_OWNER)
			return
		}
		if (group) {
			setName(group.name)
			setOwnerChoice(group.owner?.id ?? ADMINS_OWNER)
		} else {
			setName('')
			setSelectedIds([])
			setOwnerChoice(ADMINS_OWNER)
		}
	}, [open, group])

	useEffect(() => {
		const members = groupData?.group.members
		if (!members) return
		setSelectedIds(members.map((m) => m.id))
		setPeople((prev) => {
			const next = { ...prev }
			for (const m of members) {
				const label = personLabel({ name: m.name })
				next[m.id] = { label: zoneAll && label === '—' && m.login ? m.login : label, isActive: m.isActive }
			}
			return next
		})
	}, [groupData, zoneAll])

	const chips = useMemo(
		() =>
			selectedIds.flatMap((id) => {
				const user = zoneAll ? usersById.get(id) : undefined
				if (user) return [{ id, label: displayName(user), isActive: user.isActive }]
				const person = people[id]
				return person ? [{ id, ...person }] : []
			}),
		[selectedIds, usersById, people, zoneAll]
	)

	const toggleUser = (id: string) => {
		setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
	}

	const toggleCandidate = (candidate: Candidate) => {
		setPeople((prev) => ({ ...prev, [candidate.id]: { label: personLabel(candidate), isActive: true } }))
		toggleUser(candidate.id)
	}

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error('Введите название группы')
			return
		}
		setSaving(true)
		const payload = groupSavePayload({
			zoneAll,
			name,
			memberIds: selectedIds,
			ownerId: ownerChoice === ADMINS_OWNER ? null : ownerChoice,
		})
		const outcome = await saveGroup({ id: group?.id, body: payload })
		setSaving(false)
		if (!outcome.ok) {
			if (outcome.kind !== 'auth') toast.error(groupSaveErrorText(outcome.status))
			return
		}
		onSaved()
		onOpenChange(false)
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="max-w-sm">
				<SheetHeader>
					<SheetTitle>{group ? 'Редактировать группу' : 'Создать группу'}</SheetTitle>
				</SheetHeader>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
					<div className="space-y-1">
						<Label htmlFor="group-name" className="text-sm text-muted-foreground">
							Название группы
						</Label>
						<Input
							id="group-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Название группы"
						/>
					</div>

					{zoneAll && (
						<div className="space-y-1">
							<Label htmlFor="group-owner" className="text-sm text-muted-foreground">
								Владелец
							</Label>
							<Select value={ownerChoice} onValueChange={setOwnerChoice}>
								<SelectTrigger id="group-owner" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ADMINS_OWNER}>{ADMINS_OWNER_LABEL}</SelectItem>
									{ownerOptions.map((owner) => (
										<SelectItem key={owner.id} value={owner.id}>
											<span className="truncate">{ownerLabel(owner)}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">{OWNER_HINT}</p>
						</div>
					)}

					{open && group && membersLoading && (
						<div className="space-y-2">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					)}

					{(!group || !membersLoading) && (
						<div className="space-y-2">
							<Label className="text-sm text-muted-foreground">Участники: {selectedIds.length}</Label>
							{zoneAll && (
								<UserStatusFilter value={statusFilter} onChange={setStatusFilter} label="Статус участников" />
							)}
							<Popover open={comboOpen} onOpenChange={setComboOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between">
										{zoneAll ? 'Добавить участников...' : 'Добавить учеников...'}
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-(--radix-popover-trigger-width) p-0">
									{zoneAll ? (
										<Command>
											<CommandInput placeholder="Поиск по имени или логину" />
											<CommandList>
												<CommandEmpty>Пользователи не найдены</CommandEmpty>
												<CommandGroup>
													{visibleUsers.map((u) => (
														<CommandItem
															key={u.id}
															value={`${displayName(u)} ${u.login}`}
															onSelect={() => toggleUser(u.id)}
														>
															<Check
																className={cn('mr-2 h-4 w-4', selectedIds.includes(u.id) ? 'opacity-100' : 'opacity-0')}
															/>
															{displayName(u)}
															{u.login && <span className="ml-1 text-xs text-muted-foreground">@{u.login}</span>}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									) : (
										<Command shouldFilter={false}>
											<CommandInput placeholder="Поиск по имени" value={query} onValueChange={setQuery} />
											<CommandList>
												{searchState === 'hint' && (
													<p className="px-3 py-2 text-xs text-muted-foreground">{CANDIDATES_HINT}</p>
												)}
												{searchState === 'loading' && (
													<p role="status" className="px-3 py-2 text-sm text-muted-foreground">
														Ищем…
													</p>
												)}
												{searchState === 'error' && (
													<p role="alert" className="px-3 py-2 text-sm text-destructive">
														{CANDIDATES_ERROR}
													</p>
												)}
												{searchState === 'empty' && <CommandEmpty>{CANDIDATES_EMPTY}</CommandEmpty>}
												{searchState === 'list' && (
													<CommandGroup>
														{candidates.map((u) => (
															<CommandItem key={u.id} value={u.id} onSelect={() => toggleCandidate(u)}>
																<Check
																	className={cn(
																		'mr-2 h-4 w-4',
																		selectedIds.includes(u.id) ? 'opacity-100' : 'opacity-0'
																	)}
																/>
																<span className="truncate">{personLabel(u)}</span>
															</CommandItem>
														))}
													</CommandGroup>
												)}
											</CommandList>
										</Command>
									)}
								</PopoverContent>
							</Popover>

							{membersFailed && <p className="text-xs text-destructive">Не удалось загрузить участников группы</p>}
							{usersFailed && <p className="text-xs text-destructive">Не удалось загрузить список пользователей</p>}

							{chips.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-2">
									{chips.map((chip) => (
										<Badge key={chip.id} variant="secondary" className="max-w-full gap-1">
											<span className="min-w-0 truncate">
												{chip.label}
												{!zoneAll && !chip.isActive && <span className="text-muted-foreground"> · приглашён</span>}
											</span>
											<button
												type="button"
												aria-label={`Убрать ${chip.label}`}
												className="shrink-0 cursor-pointer"
												onClick={() => toggleUser(chip.id)}
											>
												<X className="h-3 w-3" aria-hidden="true" />
											</button>
										</Badge>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<SheetFooter className="flex-col gap-2 px-4">
					<Button
						className="w-full"
						onClick={handleSave}
						disabled={groupSaveDisabled({ saving, editing: Boolean(group), membersLoading, membersFailed })}
					>
						{saving ? 'Сохранение...' : 'Сохранить группу'}
					</Button>
					<span
						className="cursor-pointer text-center text-sm text-muted-foreground"
						onClick={() => onOpenChange(false)}
					>
						Отмена
					</span>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}
