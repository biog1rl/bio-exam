'use client'

import { useState, useMemo } from 'react'

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import useSWR from 'swr'

import { DeleteGroupDialog } from '@/components/groups/DeleteGroupDialog'
import { GroupSheet, type GroupSheetGroup } from '@/components/groups/GroupSheet'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TEACHER_GROUPS_EMPTY, groupsEmptyState, ownerLabel } from '@/lib/groups/group-form'

type Group = GroupSheetGroup

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function GroupsClient() {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const { data, isLoading, mutate } = useSWR<{ groups: Group[] }>('/api/groups', fetcher)
	const [search, setSearch] = useState('')
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editTarget, setEditTarget] = useState<Group | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)

	const groups = useMemo(() => data?.groups ?? [], [data])
	const filtered = useMemo(() => {
		if (!search.trim()) return groups
		const q = search.toLowerCase().trim()
		return groups.filter((g) => g.name.toLowerCase().includes(q))
	}, [groups, search])
	const columns = zoneAll ? 4 : 3
	const emptyState = groupsEmptyState({ zoneAll, groups: groups.length, search })

	const openCreate = () => {
		setEditTarget(null)
		setSheetOpen(true)
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">Группы</h1>
				<Button size="icon" variant="outline" aria-label="Создать группу" onClick={openCreate}>
					<PlusIcon />
				</Button>
			</div>

			<Input
				placeholder="Поиск по названию..."
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				className="w-full sm:w-64"
			/>

			<div className="overflow-hidden rounded-md border">
				<div className="overflow-auto">
					<Table className="min-w-100 tab-sm:min-w-0">
						<TableHeader>
							<TableRow>
								<TableHead>Название</TableHead>
								{zoneAll && <TableHead>Владелец</TableHead>}
								<TableHead>Участников</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading &&
								Array.from({ length: 5 }).map((_, i) => (
									<TableRow key={i}>
										<TableCell>
											<Skeleton className="h-4 w-48" />
										</TableCell>
										{zoneAll && (
											<TableCell>
												<Skeleton className="h-4 w-32" />
											</TableCell>
										)}
										<TableCell>
											<Skeleton className="h-4 w-8" />
										</TableCell>
										<TableCell>
											<Skeleton className="h-8 w-28" />
										</TableCell>
									</TableRow>
								))}

							{!isLoading && !data && (
								<TableRow>
									<TableCell colSpan={columns} className="text-center text-muted-foreground">
										Не удалось загрузить группы. Обновите страницу.
									</TableCell>
								</TableRow>
							)}

							{!isLoading && data && filtered.length === 0 && emptyState === 'teacher-empty' && (
								<TableRow>
									<TableCell colSpan={columns} className="whitespace-normal">
										<div className="flex flex-col items-start gap-3 rounded-3xl bg-secondary/70 p-unit text-sm text-muted-foreground">
											<p>{TEACHER_GROUPS_EMPTY}</p>
											<Button className="w-full mob:w-auto" onClick={openCreate}>
												<PlusIcon aria-hidden="true" />
												Создать группу
											</Button>
										</div>
									</TableCell>
								</TableRow>
							)}

							{!isLoading && data && filtered.length === 0 && emptyState === 'default' && (
								<TableRow>
									<TableCell colSpan={columns} className="text-center text-muted-foreground">
										{search ? 'Группы не найдены. Попробуйте изменить запрос.' : 'Групп пока нет'}
									</TableCell>
								</TableRow>
							)}

							{!isLoading &&
								data &&
								filtered.map((g) => (
									<TableRow key={g.id}>
										<TableCell>{g.name}</TableCell>
										{zoneAll && <TableCell>{ownerLabel(g.owner)}</TableCell>}
										<TableCell>{g.memberCount}</TableCell>
										<TableCell>
											<div className="flex justify-end gap-2">
												<Button
													size="icon"
													variant="outline"
													aria-label="Изменить группу"
													onClick={() => {
														setEditTarget(g)
														setSheetOpen(true)
													}}
												>
													<PencilIcon />
												</Button>
												<Button
													size="icon"
													variant="destructive"
													aria-label="Удалить группу"
													onClick={() => setDeleteTarget(g)}
												>
													<Trash2Icon />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</div>
			</div>

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
