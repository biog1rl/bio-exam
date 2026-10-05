'use client'

import { PERMISSION_DOMAINS } from '@bio-exam/rbac'

import { useMemo, useRef, useState } from 'react'

import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { RbacSwitchesRow, type GrantsState } from '@/components/rbac/RbacSwitchesRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { failureMessage } from '@/lib/http/errors'
import { removeUserGrant, setUserGrant, userGrantsFetcher, userGrantsKey } from '@/lib/users/api'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	userId: string | null
}

export function UserGrantsDialog({ open, onOpenChange, userId }: Props) {
	const enabled = open && Boolean(userId)
	const { data, error, mutate, isLoading } = useSWR(enabled && userId ? userGrantsKey(userId) : null, userGrantsFetcher)
	const [saving, setSaving] = useState(false)
	const titleRef = useRef<HTMLHeadingElement>(null)
	const loadFailed = error !== undefined && data === undefined

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
			let outcome: Awaited<ReturnType<typeof setUserGrant>> | null = null
			if (next !== roleHas) outcome = await setUserGrant({ userId, domain, action, allow: next })
			else if (hasOverride) outcome = await removeUserGrant({ userId, domain, action })
			if (outcome && !outcome.ok) {
				const message = failureMessage(outcome)
				if (message) toast.error(message)
				return
			}
			await mutate()
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="tab-sm:max-w-180">
				<DialogHeader>
					<DialogTitle ref={titleRef} tabIndex={-1}>
						Права пользователя
					</DialogTitle>
				</DialogHeader>

				{loadFailed ? (
					<LoadErrorAlert
						title="Не удалось загрузить права пользователя"
						error={error}
						onRetry={() => mutate()}
						focusTarget={titleRef}
					/>
				) : (
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
						<p className="text-xs text-muted-foreground">
							Персональные права **имеют приоритет** над ролью: включение добавляет доступ, выключение может отключить
							даже права, пришедшие от роли.
						</p>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						Закрыть
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
