'use client'

import { useState, useMemo } from 'react'

import { Search } from 'lucide-react'
import { useSWRConfig } from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { UserRow } from '@/types/users'

import { UserRowItem } from './UserRowItem'
import { EditUserDialog } from './dialogs/EditUserDialog'
import { ReinviteUserDialog } from './dialogs/ReinviteUserDialog'

type Props = {
	rows: UserRow[]
	isLoading: boolean
	canEdit?: boolean
}

export function UsersTable({ rows, isLoading, canEdit }: Props) {
	const { mutate } = useSWRConfig()
	const { can } = useAuth()

	const effectiveCanEdit = typeof canEdit === 'boolean' ? canEdit : can('users', 'edit')
	const canInvite = can('users', 'invite')

	const cols = 6 + (effectiveCanEdit ? 1 : 0)

	const [searchQuery, setSearchQuery] = useState('')
	const [editOpen, setEditOpen] = useState(false)
	const [reinviteOpen, setReinviteOpen] = useState(false)
	const [currentUser, setCurrentUser] = useState<UserRow | null>(null)

	const handleEditClick = (u: UserRow) => {
		setCurrentUser(u)
		setEditOpen(true)
	}

	const handleReinviteClick = (u: UserRow) => {
		setCurrentUser(u)
		setReinviteOpen(true)
	}

	const afterChange = () => {
		void mutate('/api/users')
	}

	// Фильтрация пользователей по поисковому запросу
	const filteredRows = useMemo(() => {
		if (!searchQuery.trim()) return rows

		const query = searchQuery.toLowerCase().trim()
		return rows.filter((user) => {
			const login = (user.login ?? '').toLowerCase()
			const firstName = (user.firstName ?? '').toLowerCase()
			const lastName = (user.lastName ?? '').toLowerCase()
			const fullName = `${firstName} ${lastName}`.trim()

			return login.includes(query) || fullName.includes(query) || firstName.includes(query) || lastName.includes(query)
		})
	}, [rows, searchQuery])

	const body = useMemo(() => {
		if (isLoading) {
			return Array.from({ length: 5 }).map((_, i) => (
				<TableRow key={`sk-${i}`} className="h-14">
					<TableCell>
						<Skeleton className="h-4 w-[85%]" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-[55%]" />
					</TableCell>
					<TableCell className="space-x-2">
						<Skeleton className="inline-block h-5 w-16 rounded-full" />
						<Skeleton className="inline-block h-5 w-20 rounded-full" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-5 w-20 rounded-full" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-28" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-24" />
					</TableCell>
					{effectiveCanEdit && (
						<TableCell className="text-right">
							<Skeleton className="h-8 w-28" />
						</TableCell>
					)}
				</TableRow>
			))
		}

		if (!filteredRows.length) {
			return (
				<TableRow>
					<TableCell colSpan={cols} className="text-muted-foreground h-24 text-center">
						{searchQuery ? 'Пользователи не найдены' : 'Нет пользователей'}
					</TableCell>
				</TableRow>
			)
		}

		return filteredRows.map((u) => (
			<UserRowItem
				key={u.id}
				user={u}
				searchQuery={searchQuery}
				canEditRow={effectiveCanEdit}
				canInvite={canInvite}
				onEditClick={handleEditClick}
				onReinviteClick={handleReinviteClick}
			/>
		))
	}, [isLoading, filteredRows, searchQuery, cols, effectiveCanEdit, canInvite])

	return (
		<>
			<div className="mb-4">
				<div className="relative">
					<Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
					<Input
						type="text"
						placeholder="Поиск..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			<div className="overflow-hidden rounded-md border">
				<div className="overflow-auto">
					<Table className="min-w-[980px]">
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead>Логин</TableHead>
								<TableHead>Имя</TableHead>
								<TableHead>Роли</TableHead>
								<TableHead>Статус</TableHead>
								<TableHead>Создан</TableHead>
								<TableHead>Кем создан</TableHead>
								{effectiveCanEdit && <TableHead className="text-right">Действия</TableHead>}
							</TableRow>
						</TableHeader>

						<TableBody>{body}</TableBody>
					</Table>
				</div>
			</div>

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
