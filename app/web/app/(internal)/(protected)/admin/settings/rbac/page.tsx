'use client'

import type { PermissionDomain } from '@bio-exam/rbac'

import { useMemo, useRef } from 'react'

import { CircleAlert } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR, { type KeyedMutator } from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PageHeader } from '@/components/page/PageHeader'
import { useAuth } from '@/components/providers/AuthProvider'
import { PermissionsAccordion, PermissionsSkeleton, type PermissionsMode } from '@/components/rbac/PermissionsAccordion'
import {
	IMMUTABLE_ROLE_KEY,
	permissionKey,
	roleAllows,
	roleDefaultAllows,
	roleOverrides,
	withRoleOverride,
	withUserOverride,
} from '@/components/rbac/grants'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { failureMessage, failureOf } from '@/lib/http/errors'
import { RequestError, type RequestOutcome } from '@/lib/http/request'
import { deleteRoleGrant, rbacKeys, rbacRolesFetcher, setRoleGrant, type RbacRoleRow } from '@/lib/rbac/api'
import {
	removeUserGrant,
	setUserGrant,
	userGrantsFetcher,
	userGrantsKey,
	usersKeys,
	usersListFetcher,
} from '@/lib/users/api'
import type { UserRow } from '@/types/users'

const RBAC_PATH = '/admin/settings/rbac'
const ROLES_VALUE = '__roles__'
const SAVE_FAILED = 'Не удалось сохранить изменения'

type UserOption = { id: string; name: string }

function displayName(user: UserRow): string {
	return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.login || user.id
}

function editableUser(user: UserRow): boolean {
	return user.roles.every((key) => key !== IMMUTABLE_ROLE_KEY)
}

async function saveOptimistic<T>(
	mutate: KeyedMutator<T>,
	snapshot: T,
	patch: (data: T) => T,
	send: () => Promise<RequestOutcome<unknown>>
): Promise<void> {
	try {
		await mutate(
			async () => {
				const outcome = await send()
				if (!outcome.ok) throw new RequestError(outcome)
				return undefined
			},
			{
				optimisticData: (current, displayed) => patch(displayed ?? current ?? snapshot),
				populateCache: false,
				rollbackOnError: true,
				revalidate: true,
			}
		)
	} catch (error) {
		const message = failureMessage(failureOf(error), SAVE_FAILED)
		if (message) toast.error(message)
		void mutate()
	}
}

export default function RbacSettingsPage() {
	const { can } = useAuth()
	const canWrite = can('rbac', 'write')
	const canListUsers = can('users', 'read')
	const titleRef = useRef<HTMLHeadingElement>(null)
	const searchParams = useSearchParams()
	const requestedUserId = searchParams?.get('userId')?.trim() || null

	const roles = useSWR(rbacKeys.roles(), rbacRolesFetcher)
	const usersList = useSWR(canListUsers ? usersKeys.list() : null, usersListFetcher)

	const userOptions = useMemo<UserOption[] | undefined>(
		() =>
			usersList.data?.rows
				.filter(editableUser)
				.map((user) => ({ id: user.id, name: displayName(user) }))
				.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
		[usersList.data]
	)
	const usersLoading = canListUsers && usersList.data === undefined && usersList.error === undefined
	const selectedUser = requestedUserId ? (userOptions?.find((user) => user.id === requestedUserId) ?? null) : null
	const resolvingUser = requestedUserId !== null && usersLoading

	const userGrants = useSWR(selectedUser ? userGrantsKey(selectedUser.id) : null, userGrantsFetcher)

	const overrides = useMemo(() => roleOverrides(roles.data), [roles.data])
	const roleColumns = useMemo(() => [...(roles.data?.roles ?? [])].sort((a, b) => a.order - b.order), [roles.data])
	const effective = useMemo(() => new Set(userGrants.data?.effective ?? []), [userGrants.data])
	const overridden = useMemo(
		() => new Set((userGrants.data?.userOverrides ?? []).map((row) => permissionKey(row.domain, row.action))),
		[userGrants.data]
	)

	const selectMode = (value: string) => {
		const url = value === ROLES_VALUE ? RBAC_PATH : `${RBAC_PATH}?userId=${encodeURIComponent(value)}`
		window.history.pushState(null, '', url)
	}

	const saveRoleGrant = (role: RbacRoleRow, domain: PermissionDomain, action: string, next: boolean) => {
		const snapshot = roles.data
		if (!canWrite || !snapshot || role.key === IMMUTABLE_ROLE_KEY) return
		const target = { roleKey: role.key, domain, action }
		const reset = next === roleDefaultAllows(role, domain, action)
		void saveOptimistic(
			roles.mutate,
			snapshot,
			(data) => withRoleOverride(data, target, reset ? null : next),
			() => (reset ? deleteRoleGrant(target) : setRoleGrant({ ...target, allow: next }))
		)
	}

	const saveUserGrant = (domain: PermissionDomain, action: string, next: boolean) => {
		const snapshot = userGrants.data
		if (!canWrite || !snapshot || !selectedUser) return
		const key = permissionKey(domain, action)
		const reset = next === snapshot.roleKeys.includes(key)
		const hasOverride = snapshot.userOverrides.some((row) => row.domain === domain && row.action === action)
		if (reset && !hasOverride) return
		const target = { userId: selectedUser.id, domain, action }
		void saveOptimistic(
			userGrants.mutate,
			snapshot,
			(data) => withUserOverride(data, domain, action, reset ? null : next),
			() => (reset ? removeUserGrant(target) : setUserGrant({ ...target, allow: next }))
		)
	}

	const rolesFailed = roles.error !== undefined && roles.data === undefined
	const userFailed = selectedUser !== null && userGrants.error !== undefined && userGrants.data === undefined

	const accordion = (mode: PermissionsMode) => (
		<>
			<h2 className="sr-only">Права по разделам</h2>
			<PermissionsAccordion canWrite={canWrite} mode={mode} />
		</>
	)

	const content = () => {
		if (resolvingUser) return <PermissionsSkeleton />
		if (selectedUser) {
			if (userFailed) {
				return (
					<LoadErrorAlert
						title="Не удалось загрузить права пользователя"
						error={userGrants.error}
						onRetry={() => userGrants.mutate()}
						focusTarget={titleRef}
					/>
				)
			}
			return accordion({
				kind: 'user',
				userName: selectedUser.name,
				loading: userGrants.data === undefined,
				effective,
				overridden,
				onToggle: saveUserGrant,
			})
		}
		if (rolesFailed) {
			return (
				<LoadErrorAlert
					title="Не удалось загрузить роли и права"
					error={roles.error}
					onRetry={() => roles.mutate()}
					focusTarget={titleRef}
				/>
			)
		}
		if (!roles.data) return <PermissionsSkeleton />
		return accordion({
			kind: 'roles',
			roles: roleColumns,
			allows: (role, domain, action) => roleAllows(role, overrides, domain, action),
			onToggle: saveRoleGrant,
		})
	}

	return (
		<div className="space-y-4">
			<PageHeader title="Права доступа" titleRef={titleRef}>
				{usersLoading ? (
					<Skeleton className="h-10 w-full rounded-full tab-sm:w-64" />
				) : (
					<Select value={selectedUser?.id ?? ROLES_VALUE} onValueChange={selectMode}>
						<SelectTrigger aria-label="Чьи права показать" className="h-10 w-full rounded-full bg-card tab-sm:w-64">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="max-h-[calc(100dvh-2rem)]">
							<SelectItem value={ROLES_VALUE}>По ролям</SelectItem>
							{userOptions?.map((user) => (
								<SelectItem key={user.id} value={user.id}>
									{user.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</PageHeader>

			{selectedUser ? (
				<Alert variant="destructive" className="rounded-3xl bg-card tab:max-w-md">
					<CircleAlert className="size-4" aria-hidden="true" />
					<p className="mb-1 leading-none font-medium tracking-tight">Внимание</p>
					<AlertDescription className="break-words">Смена прав пользователя: {selectedUser.name}</AlertDescription>
				</Alert>
			) : null}

			{content()}
		</div>
	)
}
