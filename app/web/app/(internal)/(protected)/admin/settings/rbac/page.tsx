'use client'

import { PERMISSION_DOMAINS, type RoleKey } from '@bio-exam/rbac'

import { useMemo, useRef, useState } from 'react'

import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
import { RbacSwitchesRow, type GrantsState } from '@/components/rbac/RbacSwitchesRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { failureMessage } from '@/lib/http/errors'
import { rbacKeys, rbacRolesFetcher, setRoleGrant } from '@/lib/rbac/api'

export default function RbacSettingsPage() {
	const { can } = useAuth()
	const canWrite = can('rbac', 'write')

	const { data, error, mutate, isLoading } = useSWR(rbacKeys.roles(), rbacRolesFetcher)
	const [saving, setSaving] = useState(false)
	const titleRef = useRef<HTMLDivElement>(null)
	const loadFailed = error !== undefined && data === undefined

	const overrides = useMemo(() => {
		const map = new Map<string, boolean>()
		;(data?.overrides ?? []).forEach((o) => map.set(`${o.roleKey}:${o.domain}.${o.action}`, o.allow))
		return map
	}, [data])

	const domains = Object.keys(PERMISSION_DOMAINS)

	const onToggle = async (roleKey: RoleKey, domain: string, action: string, next: boolean) => {
		if (!canWrite) return
		if (roleKey === 'admin') return
		setSaving(true)
		try {
			const outcome = await setRoleGrant({ roleKey, domain, action, allow: next })
			if (!outcome.ok) {
				const message = failureMessage(outcome, 'Ошибка сохранения')
				if (message) toast.error(message)
				return
			}
			await mutate()
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="p-6">
			<Card>
				<CardHeader className="flex items-center justify-between">
					<CardTitle ref={titleRef} tabIndex={-1}>
						RBAC: роли и права
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{loadFailed ? (
						<LoadErrorAlert
							title="Не удалось загрузить роли и права"
							error={error}
							onRetry={() => mutate()}
							focusTarget={titleRef}
						/>
					) : null}

					{!loadFailed && isLoading && <div>Загрузка…</div>}

					{!loadFailed && !isLoading && data && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-40">Роль</TableHead>
									{domains.map((d) => (
										<TableHead key={d} className="capitalize">
											{d}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.roles
									.filter((r) => r.key !== 'admin')
									.map((r) => {
										// Собираем состояние: дефолты из реестра + role-overrides
										const state: GrantsState = {}
										domains.forEach((d) => {
											state[d] = {}
											const actions = PERMISSION_DOMAINS[d as keyof typeof PERMISSION_DOMAINS]
												.actions as readonly string[]
											actions.forEach((a) => {
												const defHas = (r.grants[d] ?? []).includes(a)
												const ov = overrides.get(`${r.key}:${d}.${a}`)
												state[d][a] = ov === undefined ? defHas : ov
											})
										})

										return (
											<RbacSwitchesRow
												key={r.key}
												label={r.name}
												state={state}
												loading={saving}
												onToggle={(d, a, next) => onToggle(r.key, d, a, next)}
											/>
										)
									})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
