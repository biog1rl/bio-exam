'use client'

import { useMemo, useState } from 'react'

import { UserPlusIcon } from 'lucide-react'
import useSWR from 'swr'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UsersTable } from '@/components/users/UsersTable'
import { InviteUserDialog } from '@/components/users/dialogs/InviteUserDialog'
import { UserRow } from '@/types/users'

type Group = { id: string; name: string }

const fetcher = (url: string) =>
	fetch(url).then((r) => {
		if (r.status === 401) {
			/* Браузер покажет basic-попап, если backend ответил WWW-Authenticate */
		}
		return r.json()
	})

export default function UsersClient() {
	const { data, mutate, isLoading } = useSWR<{ rows: UserRow[]; total: number }>('/api/users', fetcher)
	const { data: groupsData } = useSWR<{ groups: Group[] }>('/api/groups', fetcher)
	const [open, setOpen] = useState(false)
	const [groupFilter, setGroupFilter] = useState<string>('all')
	const allGroups = useMemo(() => groupsData?.groups ?? [], [groupsData])
	const users = useMemo(() => {
		const all = data?.rows ?? []
		if (groupFilter === 'all') return all
		const selectedGroup = allGroups.find((g) => g.id === groupFilter)
		if (!selectedGroup) return all
		return all.filter((u) => u.groupName === selectedGroup.name)
	}, [data, groupFilter, allGroups])
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">Пользователи</h1>
				<Button size="icon" variant="outline" onClick={() => setOpen(true)}>
					<UserPlusIcon />
				</Button>
			</div>
			{allGroups.length > 0 && (
				<div className="flex items-center gap-2">
					<Select value={groupFilter} onValueChange={setGroupFilter}>
						<SelectTrigger className="mob:w-48 w-full">
							<SelectValue placeholder="Все группы" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Все группы</SelectItem>
							{allGroups.map((g) => (
								<SelectItem key={g.id} value={g.id}>
									{g.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
			<UsersTable rows={users} isLoading={isLoading} />
			<InviteUserDialog open={open} onOpenChange={setOpen} onCreated={() => mutate()} />
		</div>
	)
}
