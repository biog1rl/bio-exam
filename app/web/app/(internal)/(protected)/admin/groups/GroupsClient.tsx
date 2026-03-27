'use client'

import { useState, useMemo } from 'react'

import { PlusIcon } from 'lucide-react'
import useSWR from 'swr'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GroupSheet } from '@/components/groups/GroupSheet'
import { DeleteGroupDialog } from '@/components/groups/DeleteGroupDialog'

type Group = { id: string; name: string; memberCount: number; createdAt: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function GroupsClient() {
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

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Группы</h1>
				<Button
					size="icon"
					variant="outline"
					aria-label="Создать группу"
					onClick={() => {
						setEditTarget(null)
						setSheetOpen(true)
					}}
				>
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
					<Table className="min-w-[400px]">
						<TableHeader>
							<TableRow>
								<TableHead>Название</TableHead>
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
									<TableCell colSpan={3} className="text-center text-muted-foreground">
										Не удалось загрузить группы. Обновите страницу.
									</TableCell>
								</TableRow>
							)}

							{!isLoading && data && filtered.length === 0 && (
								<TableRow>
									<TableCell colSpan={3} className="text-center text-muted-foreground">
										{search ? 'Группы не найдены. Попробуйте изменить запрос.' : 'Групп пока нет'}
									</TableCell>
								</TableRow>
							)}

							{!isLoading &&
								data &&
								filtered.map((g) => (
									<TableRow key={g.id}>
										<TableCell>{g.name}</TableCell>
										<TableCell>{g.memberCount}</TableCell>
										<TableCell>
											<div className="flex gap-2">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														setEditTarget(g)
														setSheetOpen(true)
													}}
												>
													Изменить
												</Button>
												<Button
													size="sm"
													variant="ghost"
													className="text-destructive hover:text-destructive"
													onClick={() => setDeleteTarget(g)}
												>
													Удалить
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</div>
			</div>

			<GroupSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				group={editTarget}
				onSaved={() => mutate()}
			/>
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
