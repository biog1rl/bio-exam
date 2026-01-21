'use client'

import { PERMISSION_DOMAINS } from '@bio-exam/rbac'

import { Switch } from '@/components/ui/switch'
import { TableRow, TableCell } from '@/components/ui/table'

export type GrantsState = Record<string, Record<string, boolean>> // { domain: { action: checked } }

type Props = {
	label: string
	state: GrantsState
	disabledMap?: Record<string, Record<string, boolean>> // {domain: {action: disabled}}
	onToggle: (domain: string, action: string, next: boolean) => void
	loading?: boolean
}

export function RbacSwitchesRow({ label, state, disabledMap, loading, onToggle }: Props) {
	const domains = Object.keys(PERMISSION_DOMAINS)

	return (
		<TableRow>
			<TableCell className="font-medium">{label}</TableCell>

			{domains.map((d) => {
				const actions = PERMISSION_DOMAINS[d as keyof typeof PERMISSION_DOMAINS].actions as readonly string[]
				return (
					<TableCell key={d}>
						<div className="flex flex-wrap gap-3">
							{actions.map((a) => {
								const checked = Boolean(state[d]?.[a])
								const disabled = Boolean(disabledMap?.[d]?.[a]) || Boolean(loading)
								return (
									<label key={`${d}.${a}`} className="flex items-center gap-2">
										<Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onToggle(d, a, Boolean(v))} />
										<span className="text-sm">{a}</span>
									</label>
								)
							})}
						</div>
					</TableCell>
				)
			})}
		</TableRow>
	)
}
