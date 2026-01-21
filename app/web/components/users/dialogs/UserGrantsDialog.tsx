'use client'

import { PERMISSION_DOMAINS } from '@bio-exam/rbac'

import { useMemo, useState } from 'react'

import useSWR from 'swr'

import { RbacSwitchesRow, type GrantsState } from '@/components/rbac/RbacSwitchesRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	userId: string | null
}

type GrantsResponse = {
	roles: string[]
	roleKeys: string[] // эффективные права от ролей (после role-overrides)
	userOverrides: Array<{ domain: string; action: string; allow: boolean }>
	effective: string[] // итог
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

export function UserGrantsDialog({ open, onOpenChange, userId }: Props) {
	const enabled = open && Boolean(userId)
	const { data, mutate, isLoading } = useSWR<GrantsResponse>(
		enabled ? `/api/rbac/user/${userId}/grants` : null,
		fetcher
	)
	const [saving, setSaving] = useState(false)

	const roleSet = useMemo(() => new Set(data?.roleKeys ?? []), [data])
	const effectiveSet = useMemo(() => new Set(data?.effective ?? []), [data])

	// Быстрый поиск наличия override по ключу
	const userOverridesMap = useMemo(() => {
		const m = new Map<string, boolean>()
		for (const o of data?.userOverrides ?? []) m.set(`${o.domain}.${o.action}`, o.allow)
		return m
	}, [data])

	const state: GrantsState = useMemo(() => {
		const map: GrantsState = {}
		Object.keys(PERMISSION_DOMAINS).forEach((d) => {
			map[d] = {}
			const actions = PERMISSION_DOMAINS[d as keyof typeof PERMISSION_DOMAINS].actions as readonly string[]
			actions.forEach((a) => {
				map[d][a] = effectiveSet.has(`${d}.${a}`)
			})
		})
		return map
	}, [effectiveSet])

	const toggle = async (domain: string, action: string, next: boolean) => {
		if (!userId) return
		const key = `${domain}.${action}`
		const roleHas = roleSet.has(key)
		const hasOverride = userOverridesMap.has(key)

		setSaving(true)
		try {
			if (next === roleHas) {
				// хотим вернуться к поведению роли -> удалить override (если есть)
				if (hasOverride) {
					const res = await fetch('/api/rbac/user/grant', {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'include',
						body: JSON.stringify({ userId, domain, action }),
					})
					if (!res.ok) throw new Error(await res.text())
				}
			} else {
				// хотим переопределить поведение роли -> upsert allow = next (true=allow, false=deny)
				const res = await fetch('/api/rbac/user/grant', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ userId, domain, action, allow: next }),
				})
				if (!res.ok) throw new Error(await res.text())
			}
			await mutate()
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[720px]">
				<DialogHeader>
					<DialogTitle>Права пользователя</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-40">Субъект</TableHead>
								{Object.keys(PERMISSION_DOMAINS).map((d) => (
									<TableHead key={d} className="capitalize">
										{d}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							<RbacSwitchesRow label="Пользователь" state={state} onToggle={toggle} loading={isLoading || saving} />
						</TableBody>
					</Table>
					<p className="text-muted-foreground text-xs">
						Персональные права **имеют приоритет** над ролью: включение добавляет доступ, выключение может отключить
						даже права, пришедшие от роли.
					</p>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						Закрыть
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
