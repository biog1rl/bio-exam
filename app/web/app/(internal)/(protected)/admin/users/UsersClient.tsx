'use client'

import { useMemo, useRef, useState } from 'react'

import { UserPlusIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UsersTable } from '@/components/users/UsersTable'
import { InviteUserDialog } from '@/components/users/dialogs/InviteUserDialog'
import { groupsKeys, groupsListFetcher } from '@/lib/groups/api'
import { usersKeys, usersListFetcher } from '@/lib/users/api'
import { matchesGroup } from '@/lib/users/invite-form'
import { effectiveGroup, parseUsersGroup, usersUrl } from '@/lib/users/users-url'

export default function UsersClient() {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const canInvite = can('users', 'invite')
	const { data, error, mutate, isLoading } = useSWR(usersKeys.list(), usersListFetcher)
	const { data: groupsData } = useSWR(groupsKeys.list(), groupsListFetcher)
	const titleRef = useRef<HTMLHeadingElement>(null)
	const [open, setOpen] = useState(false)
	const searchParams = useSearchParams()
	const allGroups = useMemo(() => groupsData?.groups ?? [], [groupsData])
	const groupFilter =
		effectiveGroup(parseUsersGroup(searchParams ?? new URLSearchParams()), groupsData?.groups) ?? 'all'
	const setGroupFilter = (value: string) => {
		window.history.replaceState(null, '', usersUrl(value === 'all' ? null : value))
	}
	const users = useMemo(() => {
		const all = data?.rows ?? []
		if (groupFilter === 'all') return all
		const selectedGroup = allGroups.find((g) => g.id === groupFilter)
		if (!selectedGroup) return all
		return all.filter((u) => matchesGroup(u, selectedGroup.id))
	}, [data, groupFilter, allGroups])
	const loadFailed = error !== undefined && data === undefined
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h1 ref={titleRef} tabIndex={-1} className="text-xl font-semibold">
						Пользователи
					</h1>
					{!zoneAll && (
						<p className="text-sm text-muted-foreground">Ученики ваших групп. Профиль меняет администратор.</p>
					)}
				</div>
				{canInvite && (
					<Button variant="outline" className="w-full mob:w-auto" onClick={() => setOpen(true)}>
						<UserPlusIcon className="size-4" aria-hidden />
						{zoneAll ? 'Пригласить пользователя' : 'Пригласить ученика'}
					</Button>
				)}
			</div>
			{allGroups.length > 0 && (
				<div className="flex items-center gap-2">
					<Select value={groupFilter} onValueChange={setGroupFilter}>
						<SelectTrigger className="w-full mob:w-48">
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
			{loadFailed ? (
				<LoadErrorAlert
					title="Не удалось загрузить пользователей"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			) : (
				<UsersTable rows={users} isLoading={isLoading} />
			)}
			{canInvite && <InviteUserDialog open={open} onOpenChange={setOpen} onCreated={() => mutate()} />}
		</div>
	)
}
