'use client'

import { roleDisplayName } from '@bio-exam/rbac'

import { Pencil, Link as LinkIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'
import { highlightText } from '@/lib/search/highlight'
import type { UserRow } from '@/types/users'

type Props = {
	user: UserRow
	searchQuery?: string
	canEditRow: boolean
	canInvite: boolean
	onEditClick: (u: UserRow) => void
	onReinviteClick: (u: UserRow) => void
}

export function UserRowItem({ user, searchQuery, canEditRow, canInvite, onEditClick, onReinviteClick }: Props) {
	const active = Boolean(user.isActive)
	const fullName = [user.firstName ?? '', user.lastName ?? ''].join(' ').trim()
	const allowReinvite = !active && canInvite

	const loginDisplay = user.login ?? '—'
	const nameDisplay = fullName || user.name || '—'

	const highlightedLogin = searchQuery ? highlightText(loginDisplay, searchQuery) : loginDisplay
	const highlightedName = searchQuery ? highlightText(nameDisplay, searchQuery) : nameDisplay

	return (
		<TableRow>
			<TableCell className="font-medium">
				<div className="flex flex-col">
					<span dangerouslySetInnerHTML={{ __html: highlightedLogin }} />
				</div>
			</TableCell>

			<TableCell>
				<span dangerouslySetInnerHTML={{ __html: highlightedName }} />
			</TableCell>

			<TableCell>
				{user.roles.length > 0 ? (
					<div className="flex flex-wrap gap-1.5">
						{user.roles.map((r) => (
							<Badge key={r} variant="secondary" className="capitalize">
								{roleDisplayName(r)}
							</Badge>
						))}
					</div>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>

			<TableCell>
				{active ? <Badge variant="default">Активен</Badge> : <Badge variant="outline">Ожидает</Badge>}
			</TableCell>

			<TableCell>{formatDateTime(user.createdAt)}</TableCell>
			<TableCell>{user.createdByName ?? '—'}</TableCell>

			{canEditRow && (
				<TableCell className="space-x-2 text-right">
					<div className="flex justify-end gap-2">
						<Button size="icon" variant="outline" onClick={() => onEditClick(user)}>
							<Pencil />
						</Button>

						{allowReinvite && (
							<Button size="icon" variant="outline" onClick={() => onReinviteClick(user)}>
								<LinkIcon />
							</Button>
						)}
					</div>
				</TableCell>
			)}
		</TableRow>
	)
}

function formatDateTime(iso: string) {
	try {
		return new Date(iso).toLocaleString()
	} catch {
		return iso
	}
}
