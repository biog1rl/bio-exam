'use client'

import { useMemo, useState } from 'react'

import { UserPlusIcon } from 'lucide-react'
import useSWR from 'swr'

import { Button } from '@/components/ui/button'
import { UsersTable } from '@/components/users/UsersTable'
import { InviteUserDialog } from '@/components/users/dialogs/InviteUserDialog'
import { UserRow } from '@/types/users'

const fetcher = (url: string) =>
	fetch(url).then((r) => {
		if (r.status === 401) {
			/* Браузер покажет basic-попап, если backend ответил WWW-Authenticate */
		}
		return r.json()
	})

export default function UsersClient() {
	const { data, mutate, isLoading } = useSWR<{ users: UserRow[] }>('/api/users', fetcher)
	const [open, setOpen] = useState(false)
	const users = useMemo(() => data?.users ?? [], [data])
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Пользователи</h1>
				<Button size="icon" variant="outline" onClick={() => setOpen(true)}>
					<UserPlusIcon />
				</Button>
			</div>
			<UsersTable rows={users} isLoading={isLoading} />
			<InviteUserDialog open={open} onOpenChange={setOpen} onCreated={() => mutate()} />
		</div>
	)
}
