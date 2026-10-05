'use client'

import { roleDisplayName } from '@bio-exam/rbac'

import { Pencil, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { highlightText } from '@/lib/search/highlight'
import { groupsCell, groupsTitle, showReinvite } from '@/lib/users/invite-form'
import type { UserRow } from '@/types/users'

type Props = {
	user: UserRow
	searchQuery?: string
	canEditRow: boolean
	canInvite: boolean
	zoneAll: boolean
	onEditClick: (u: UserRow) => void
	onReinviteClick: (u: UserRow) => void
}

export function UserRowItem({
	user,
	searchQuery,
	canEditRow,
	canInvite,
	zoneAll,
	onEditClick,
	onReinviteClick,
}: Props) {
	const active = Boolean(user.isActive)
	const fullName = [user.firstName ?? '', user.lastName ?? ''].join(' ').trim()
	const allowReinvite = showReinvite({ isActive: active, activatedAt: user.activatedAt }, { canInvite, zoneAll })
	const profileHref = user.login ? `/profile/${encodeURIComponent(user.login)}` : `/admin/users/${user.id}`

	const loginDisplay = user.login ?? '—'
	const nameDisplay = fullName || user.name || '—'

	const highlightedLogin = searchQuery ? highlightText(loginDisplay, searchQuery) : loginDisplay
	const highlightedName = searchQuery ? highlightText(nameDisplay, searchQuery) : nameDisplay

	return (
		<TableRow>
			<TableCell className="font-medium">
				<div className="flex flex-col">
					<Link href={profileHref} className="hover:underline" dangerouslySetInnerHTML={{ __html: highlightedLogin }} />
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
				{active ? <Badge variant="default">Активен</Badge> : <Badge variant="outline">Неактивен</Badge>}
			</TableCell>

			<TableCell>
				{user.groups.length > 0 ? (
					<span className="text-sm" title={groupsTitle(user.groups)}>
						{groupsCell(user.groups)}
					</span>
				) : (
					<span className="text-sm text-muted-foreground">—</span>
				)}
			</TableCell>

			<TableCell>{formatDateTime(user.createdAt)}</TableCell>
			<TableCell>{user.createdByName ?? '—'}</TableCell>

			{(canEditRow || canInvite) && (
				<TableCell className="space-x-2 text-right">
					<div className="flex justify-end gap-2">
						{canEditRow && (
							<Button size="icon" variant="outline" aria-label="Изменить профиль" onClick={() => onEditClick(user)}>
								<Pencil aria-hidden />
							</Button>
						)}

						{allowReinvite && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="outline"
										aria-label="Новая ссылка приглашения"
										onClick={() => onReinviteClick(user)}
									>
										<LinkIcon aria-hidden />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Новая ссылка приглашения</TooltipContent>
							</Tooltip>
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
