'use client'

import { useState, useEffect, useMemo } from 'react'

import { Check, ChevronsUpDown, X } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'
import type { UserRow } from '@/types/users'

interface Group {
	id: string
	name: string
	memberCount: number
	createdAt: string
}

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	group: Group | null
	onSaved: () => void
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function GroupSheet({ open, onOpenChange, group, onSaved }: Props) {
	const [name, setName] = useState('')
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [comboOpen, setComboOpen] = useState(false)
	const [saving, setSaving] = useState(false)

	const { data: usersData } = useSWR<{ users: UserRow[] }>('/api/users', fetcher)
	const allUsers = useMemo(() => usersData?.users ?? [], [usersData])

	const { data: groupData, isLoading: membersLoading } = useSWR(
		open && group ? `/api/groups/${group.id}` : null,
		fetcher
	)

	useEffect(() => {
		if (!open) {
			setName('')
			setSelectedIds([])
			setComboOpen(false)
			setSaving(false)
			return
		}
		if (group) {
			setName(group.name)
		} else {
			setName('')
			setSelectedIds([])
		}
	}, [open, group])

	useEffect(() => {
		if (groupData?.group?.members) {
			setSelectedIds(groupData.group.members.map((m: { id: string }) => m.id))
		}
	}, [groupData])

	const selectedUsers = useMemo(() => allUsers.filter((u) => selectedIds.includes(u.id)), [allUsers, selectedIds])

	const displayName = (u: UserRow) => {
		const full = [u.firstName, u.lastName].filter(Boolean).join(' ')
		return full || u.name || u.login
	}

	const toggleUser = (id: string) => {
		setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
	}

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error('Введите название группы')
			return
		}
		setSaving(true)
		try {
			if (group) {
				const res = await apiFetch(`/api/groups/${group.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: name.trim(), memberIds: selectedIds }),
				})
				if (!res.ok) throw new Error()
			} else {
				const res = await apiFetch('/api/groups', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: name.trim(), memberIds: selectedIds }),
				})
				if (!res.ok) throw new Error()
			}
			onSaved()
			onOpenChange(false)
		} catch {
			toast.error('Не удалось сохранить. Попробуйте ещё раз.')
		} finally {
			setSaving(false)
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="max-w-sm">
				<SheetHeader>
					<SheetTitle>{group ? 'Редактировать группу' : 'Создать группу'}</SheetTitle>
				</SheetHeader>

				<div className="space-y-4 px-4 py-4">
					{/* Group name */}
					<div className="space-y-1">
						<Label htmlFor="group-name" className="text-muted-foreground text-sm">
							Название группы
						</Label>
						<Input
							id="group-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Название группы"
						/>
					</div>

					{/* Members loading skeleton (edit mode only) */}
					{open && group && membersLoading && (
						<div className="space-y-2">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					)}

					{/* Combobox user picker */}
					{(!group || !membersLoading) && (
						<div className="space-y-2">
							<Label className="text-muted-foreground text-sm">Участники</Label>
							<Popover open={comboOpen} onOpenChange={setComboOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between">
										Добавить участников...
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0">
									<Command>
										<CommandInput placeholder="Поиск по имени или логину" />
										<CommandList>
											<CommandEmpty>Пользователи не найдены</CommandEmpty>
											<CommandGroup>
												{allUsers.map((u) => (
													<CommandItem
														key={u.id}
														value={`${displayName(u)} ${u.login}`}
														onSelect={() => toggleUser(u.id)}
													>
														<Check
															className={cn('mr-2 h-4 w-4', selectedIds.includes(u.id) ? 'opacity-100' : 'opacity-0')}
														/>
														{displayName(u)}
														{u.login && <span className="text-muted-foreground ml-1 text-xs">@{u.login}</span>}
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>

							{/* Member chips */}
							{selectedUsers.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-2">
									{selectedUsers.map((u) => (
										<Badge
											key={u.id}
											variant="secondary"
											className="cursor-pointer gap-1"
											onClick={() => toggleUser(u.id)}
										>
											{displayName(u)}
											<X className="h-3 w-3" />
										</Badge>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<SheetFooter className="flex-col gap-2 px-4">
					<Button className="w-full" onClick={handleSave} disabled={saving}>
						{saving ? 'Сохранение...' : 'Сохранить'}
					</Button>
					<span
						className="text-muted-foreground cursor-pointer text-center text-sm"
						onClick={() => onOpenChange(false)}
					>
						Отмена
					</span>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}
