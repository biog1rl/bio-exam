'use client'

import { roleDisplayName } from '@bio-exam/rbac'

import { useMemo, useRef, useState, type ReactNode } from 'react'

import { UserPlus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { useAuth } from '@/components/providers/AuthProvider'
import { ColumnFilterMenu } from '@/components/table/ColumnFilterMenu'
import { Button } from '@/components/ui/button'
import { UsersTable } from '@/components/users/UsersTable'
import { InviteUserDialog } from '@/components/users/dialogs/InviteUserDialog'
import { groupsKeys, groupsListFetcher } from '@/lib/groups/api'
import { usersKeys, usersListFetcher } from '@/lib/users/api'
import { usersEmptyText } from '@/lib/users/invite-form'
import {
	USERS_STATUSES,
	filterUsers,
	knownOnly,
	parseUsersUrl,
	roleCounts,
	sortUsers,
	usersSearch,
	usersStatusCounts,
	type UsersStatus,
	type UsersUrlState,
} from '@/lib/users/users-url'

const STATUS_LABELS: Record<UsersStatus, string> = { active: 'Активные', inactive: 'Неактивные' }

export default function UsersClient() {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const canInvite = can('users', 'invite')
	const { data, error, mutate } = useSWR(usersKeys.list(), usersListFetcher)
	const { data: groupsData } = useSWR(groupsKeys.list(), groupsListFetcher)
	const titleRef = useRef<HTMLHeadingElement>(null)
	const [inviteOpen, setInviteOpen] = useState(false)
	const searchParams = useSearchParams()

	const allRows = useMemo(() => data?.rows ?? [], [data?.rows])
	const allGroups = useMemo(() => groupsData?.groups ?? [], [groupsData?.groups])
	const roles = useMemo(() => roleCounts(allRows), [allRows])
	const roleKeys = useMemo(() => roles.map((entry) => entry.role), [roles])
	const groupIds = useMemo(() => groupsData?.groups.map((group) => group.id), [groupsData?.groups])
	const parsed = parseUsersUrl(searchParams)
	const url: UsersUrlState = {
		...parsed,
		groups: knownOnly(parsed.groups, groupIds),
		roles: knownOnly(parsed.roles, data ? roleKeys : undefined),
	}
	const visible = sortUsers(filterUsers(allRows, url), url.sort)
	const statusCounts = usersStatusCounts(allRows)

	const updateUrl = (patch: Partial<UsersUrlState>) => {
		window.history.replaceState(null, '', `${window.location.pathname}${usersSearch({ ...url, ...patch })}`)
	}

	const loadFailed = error !== undefined && data === undefined
	const pending = data === undefined
	const hasRows = allRows.length > 0
	const tableShown = pending || visible.length > 0
	const inviteLabel = zoneAll ? 'Пригласить пользователя' : 'Пригласить ученика'

	const statusFilter = (
		<ColumnFilterMenu
			label="Фильтр по статусу"
			options={USERS_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], count: statusCounts[value] }))}
			selected={url.statuses}
			onChange={(statuses) => updateUrl({ statuses })}
		/>
	)
	const rolesFilter =
		roles.length > 0 ? (
			<ColumnFilterMenu
				label="Фильтр по ролям"
				options={roles.map(({ role, count }) => ({ value: role, label: roleDisplayName(role), count }))}
				selected={url.roles}
				onChange={(next) => updateUrl({ roles: next })}
			/>
		) : null
	const groupsFilter =
		allGroups.length > 0 ? (
			<ColumnFilterMenu
				label="Фильтр по группам"
				searchPlaceholder="Название группы"
				options={allGroups.map((group) => ({
					value: group.id,
					label: group.name,
					count: allRows.filter((row) => row.groups.some((item) => item.id === group.id)).length,
				}))}
				selected={url.groups}
				onChange={(groups) => updateUrl({ groups })}
			/>
		) : null
	const toolbarFilter = (filter: ReactNode, hiddenWithColumn: string) =>
		hasRows && filter ? <div className={tableShown ? hiddenWithColumn : undefined}>{filter}</div> : null

	return (
		<div className="space-y-4">
			<PageHeader
				title="Пользователи"
				titleRef={titleRef}
				meta={zoneAll ? undefined : 'Ученики ваших групп. Профиль меняет администратор.'}
			>
				{toolbarFilter(statusFilter, 'tab-sm:hidden')}
				{toolbarFilter(rolesFilter, 'tab:hidden')}
				{toolbarFilter(groupsFilter, 'lg:hidden')}
				<ToolbarSearch
					value={url.q}
					onChange={(q) => updateUrl({ q })}
					label="Поиск пользователей"
					placeholder="Имя или логин"
				/>
				{canInvite ? (
					<ToolbarTooltip label={inviteLabel}>
						<ToolbarButton tone="primary" label={inviteLabel} onClick={() => setInviteOpen(true)}>
							<UserPlus className="size-4" aria-hidden="true" />
						</ToolbarButton>
					</ToolbarTooltip>
				) : null}
			</PageHeader>

			{loadFailed ? (
				<LoadErrorAlert
					title="Не удалось загрузить пользователей"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			) : !hasRows && !pending ? (
				<EmptyState description={usersEmptyText({ teacher: !zoneAll, totalRows: 0 })} />
			) : !tableShown ? (
				<EmptyState
					description={usersEmptyText({ teacher: !zoneAll, totalRows: allRows.length })}
					action={
						<Button
							variant="outline"
							className="rounded-full"
							onClick={() => updateUrl({ q: '', groups: [], roles: [], statuses: [] })}
						>
							Сбросить фильтры
						</Button>
					}
				/>
			) : (
				<div className="space-y-2">
					<UsersTable
						rows={visible}
						loading={pending}
						searchQuery={url.q}
						sort={url.sort}
						onSortChange={(sort) => updateUrl({ sort })}
						rolesFilter={rolesFilter}
						groupsFilter={groupsFilter}
						statusFilter={statusFilter}
					/>
					{!pending && visible.length !== allRows.length ? (
						<p className="px-3 text-xs text-muted-foreground" aria-live="polite">
							Показано {visible.length} из {allRows.length}
						</p>
					) : null}
				</div>
			)}

			{canInvite ? (
				<InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={() => mutate()} />
			) : null}
		</div>
	)
}
