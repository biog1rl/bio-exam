'use client'

import { PERMISSION_DOMAINS, type RoleKey } from '@bio-exam/rbac'

import { useState, useMemo } from 'react'

import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { RbacSwitchesRow, type GrantsState } from '@/components/rbac/RbacSwitchesRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type RoleRow = {
	key: RoleKey
	name: string
	order: number
	grants: Record<string, string[]>
}
type OverrideRow = { roleKey: string; domain: string; action: string; allow: boolean }

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

export default function RbacSettingsPage() {
	const { can } = useAuth()
	const canWrite = can('rbac', 'write')

	const { data, mutate, isLoading } = useSWR<{ roles: RoleRow[]; overrides: OverrideRow[] }>('/api/rbac/roles', fetcher)
	const [saving, setSaving] = useState(false)

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
			const res = await fetch('/api/rbac/grant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ roleKey, domain, action, allow: next }),
			})
			if (!res.ok) throw new Error(await res.text())
			await mutate()
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="p-6">
			<Card>
				<CardHeader className="flex items-center justify-between">
					<CardTitle>RBAC: роли и права</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading && <div>Загрузка…</div>}

					{!isLoading && data && (
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
