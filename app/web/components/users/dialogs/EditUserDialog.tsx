'use client'

import { ROLES_LIST, ROLE_KEYS, roleDisplayName, type RoleKey } from '@bio-exam/rbac'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IMaskInput } from 'react-imask'

import { Check, ChevronDownIcon, ChevronsUpDown, LockKeyholeOpen, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import useSWR, { useSWRConfig } from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UserGrantsDialog } from '@/components/users/dialogs/UserGrantsDialog'
import { AuthExpiredError, apiFetch } from '@/lib/api-fetch'
import { LOGIN_PATTERN, LOGIN_HINT } from '@/lib/auth/validators'
import {
	buildUserPatch,
	editRoleWarning,
	groupIdsChanged,
	groupItemSuffix,
	groupsTriggerLabel,
} from '@/lib/users/edit-user-form'
import { parseInviteGroups } from '@/lib/users/invite-form'
import { useRoleTraits } from '@/lib/users/role-traits'
import { cn } from '@/lib/utils'
import type { UserRow } from '@/types/users'

import {
	actionErrorText,
	clearConfirmText,
	clearSuccessText,
	revokeConfirmText,
	revokeSuccessText,
	sessionActionsState,
	type SessionActionKind,
} from '../session-actions'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	user: UserRow | null
	onSaved?: () => void
}

type GrantsResponse = {
	roles: string[]
	roleKeys: string[]
	userOverrides: Array<{ domain: string; action: string; allow: boolean }>
	effective: string[]
}

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

function withLoginBreak(text: string, login: string) {
	const quoted = `«${login}»`
	const index = text.indexOf(quoted)
	if (!login || index < 0) return text
	return (
		<>
			{text.slice(0, index)}
			<span className="break-all">{quoted}</span>
			{text.slice(index + quoted.length)}
		</>
	)
}

function RoleZoneAlert(props: {
	initialRoleKeys: string[]
	initialRole: string | null
	selectedRole: string | null
	initialActive: boolean
	isActive: boolean
}) {
	const { roles: roleTraits, loaded } = useRoleTraits()
	const warning = editRoleWarning({ ...props, traits: roleTraits, loaded })
	if (warning === 'teacher-without-topics') {
		return (
			<Alert>
				<AlertTitle>Учитель без тем</AlertTitle>
				<AlertDescription>
					После сохранения закрепите за учителем темы в форме темы и назначьте его владельцем групп. До этого его
					разделы пустые.
				</AlertDescription>
			</Alert>
		)
	}
	if (warning === 'zone-release') {
		return (
			<Alert variant="destructive">
				<AlertTitle>Темы и группы перейдут администраторам</AlertTitle>
				<AlertDescription>
					Закрепления тем снимаются, группы учителя становятся группами администраторов. При повторном назначении их
					нужно закрепить заново.
				</AlertDescription>
			</Alert>
		)
	}
	return null
}

export function EditUserDialog({ open, onOpenChange, user, onSaved }: Props) {
	const { mutate } = useSWRConfig()
	const { me, can } = useAuth()

	const [firstName, setFirstName] = useState<string>('')
	const [lastName, setLastName] = useState<string>('')
	const [login, setLogin] = useState<string>('')
	const [isActive, setIsActive] = useState<boolean>(false)
	const [initialActive, setInitialActive] = useState<boolean>(false)
	const [initialRoleKeys, setInitialRoleKeys] = useState<string[]>([])
	const [birthdate, setBirthdate] = useState<string>('')
	const [telegram, setTelegram] = useState<string>('')
	const [phone, setPhone] = useState<string>('')
	const [email, setEmail] = useState<string>('')

	// выбранная роль и исходная роль (для сравнения)
	const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null)
	const [initialRole, setInitialRole] = useState<RoleKey | null>(null)

	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

	const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
	const [initialGroupIds, setInitialGroupIds] = useState<string[]>([])
	const [groupsOpen, setGroupsOpen] = useState(false)

	// модалка кастомных прав
	const [grantsOpen, setGrantsOpen] = useState(false)

	const [confirmAction, setConfirmAction] = useState<SessionActionKind | null>(null)
	const [pendingAction, setPendingAction] = useState<SessionActionKind | null>(null)
	const revokeButtonRef = useRef<HTMLButtonElement>(null)
	const clearButtonRef = useRef<HTMLButtonElement>(null)
	const sessionActions = sessionActionsState({
		meId: me?.id ?? null,
		user: user ? { id: user.id, login: user.login } : null,
		canEdit: can('users', 'edit'),
		pending: pendingAction !== null,
	})
	const actionPending = pendingAction !== null
	const savedLogin = user?.login ?? ''

	// грузим информацию о персональных override'ах пользователя, чтобы показать предупреждение
	const enabled = open && !!user?.id
	const { data: grantsMeta } = useSWR<GrantsResponse>(enabled ? `/api/rbac/user/${user!.id}/grants` : null, fetcher)
	const hasCustomOverrides = (grantsMeta?.userOverrides?.length ?? 0) > 0

	const { data: groupsData } = useSWR<unknown>(open ? '/api/groups' : null, fetcher)
	const allGroups = useMemo(() => parseInviteGroups(groupsData), [groupsData])
	const selectedGroups = useMemo(() => {
		const known = new Map<string, { name: string }>()
		for (const group of user?.groups ?? []) known.set(group.id, group)
		for (const group of allGroups) known.set(group.id, group)
		return selectedGroupIds.map((id) => known.get(id)).filter((group): group is { name: string } => group !== undefined)
	}, [allGroups, selectedGroupIds, user?.groups])

	useEffect(() => {
		if (!open || !user) return
		setFirstName(user.firstName ?? '')
		setLastName(user.lastName ?? '')
		setLogin(user.login ?? '')
		setIsActive(Boolean(user.isActive))
		setInitialActive(Boolean(user.isActive))
		setInitialRoleKeys(user.roles ?? [])

		// Конвертируем дату из YYYY-MM-DD в дд/мм/гггг
		if (user.birthdate) {
			const [year, month, day] = user.birthdate.split('-')
			setBirthdate(`${day}/${month}/${year}`)
		} else {
			setBirthdate('')
		}

		setTelegram(user.telegram ?? '')
		setPhone(user.phone ?? '')
		setEmail(user.email ?? '')

		// берём ПЕРВУЮ валидную роль из пользователя
		const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
		const firstValid = (user.roles ?? []).find((r) => allow.has(r)) as RoleKey | undefined
		setSelectedRole(firstValid ?? null)
		setInitialRole(firstValid ?? null)

		const groupIds = (user.groups ?? []).map((group) => group.id)
		setSelectedGroupIds(groupIds)
		setInitialGroupIds(groupIds)
		setGroupsOpen(false)

		setError(null)
	}, [open, user])

	const title = user ? `Редактировать пользователя: ${user.login}` : 'Редактировать пользователя'
	const roleChanged = useMemo(
		() => Boolean(selectedRole && initialRole && selectedRole !== initialRole),
		[selectedRole, initialRole]
	)

	async function onSubmit() {
		if (!user) return
		setSubmitting(true)
		setError(null)
		try {
			if (!selectedRole) throw new Error('Выберите роль')

			const payload = buildUserPatch({
				firstName,
				lastName,
				login,
				isActive,
				birthdate,
				telegram,
				phone,
				email,
				selectedRole,
				initialRole,
			})

			const res = await apiFetch(`/api/users/${user.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			if (!res.ok) {
				let msg = ''
				try {
					const j = await res.json()
					msg = (j?.error as string) || ''
				} catch {
					/* noop */
				}
				throw new Error(msg || `HTTP ${res.status}`)
			}

			if (payload.roles) {
				setInitialRoleKeys(payload.roles)
				setInitialRole(selectedRole)
			}
			setInitialActive(isActive)

			if (groupIdsChanged(initialGroupIds, selectedGroupIds)) {
				const groupRes = await apiFetch(`/api/users/${user.id}/group`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ groupIds: selectedGroupIds }),
				})
				if (!groupRes.ok) {
					const body: unknown = await groupRes.json().catch(() => null)
					const msg =
						body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
							? (body as { error: string }).error
							: ''
					throw new Error(msg || 'Не удалось обновить группу')
				}
				setInitialGroupIds(selectedGroupIds)
			}

			await Promise.all([mutate('/api/users'), user ? mutate(`/api/rbac/user/${user.id}/grants`) : Promise.resolve()])

			onSaved?.()
			onOpenChange(false)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
		} finally {
			setSubmitting(false)
		}
	}

	async function onDelete() {
		if (!user) return
		setDeleting(true)
		setError(null)
		try {
			const res = await apiFetch(`/api/users/${user.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			})

			if (!res.ok) {
				let msg = ''
				try {
					const j = await res.json()
					msg = (j?.error as string) || ''
				} catch {
					/* noop */
				}
				throw new Error(msg || `HTTP ${res.status}`)
			}

			await mutate('/api/users')
			onSaved?.()
			onOpenChange(false)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Не удалось удалить пользователя')
		} finally {
			setDeleting(false)
			setDeleteConfirmOpen(false)
		}
	}

	async function runSessionAction(kind: SessionActionKind) {
		if (!user) return
		const actionLogin = user.login ?? ''
		setPendingAction(kind)
		try {
			const res = await apiFetch(
				kind === 'revoke' ? `/api/users/${user.id}/sessions/revoke` : `/api/users/${user.id}/login-throttle`,
				{ method: kind === 'revoke' ? 'POST' : 'DELETE' }
			)
			if (res.ok) {
				toast.success(kind === 'revoke' ? revokeSuccessText(actionLogin) : clearSuccessText(actionLogin))
			} else {
				toast.error(actionErrorText(kind, res.status))
			}
		} catch (e) {
			if (!(e instanceof AuthExpiredError)) toast.error(actionErrorText(kind, 0))
		} finally {
			setPendingAction(null)
			setConfirmAction(null)
		}
	}

	function onConfirmOpenChange(next: boolean) {
		if (!next && !actionPending) setConfirmAction(null)
	}

	function returnFocus(kind: SessionActionKind) {
		return (event: Event) => {
			event.preventDefault()
			const target = kind === 'revoke' ? revokeButtonRef.current : clearButtonRef.current
			target?.focus()
		}
	}

	function toggleGroup(id: string) {
		setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((groupId) => groupId !== id) : [...prev, id]))
	}

	const triggerLabel = selectedRole ? roleDisplayName(selectedRole) : 'Выберите роль'
	const grantsDisabled = roleChanged // нельзя открывать, пока роль не сохранена

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent aria-modal={true} aria-describedby={title} className="max-h-dvh overflow-y-auto sm:max-w-140">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
						<RoleZoneAlert
							initialRoleKeys={initialRoleKeys}
							initialRole={initialRole}
							selectedRole={selectedRole}
							initialActive={initialActive}
							isActive={isActive}
						/>

						{roleChanged && hasCustomOverrides && (
							<Alert variant="destructive">
								<ShieldCheck className="h-4 w-4" />
								<AlertTitle>Внимание</AlertTitle>
								<AlertDescription>
									У пользователя есть кастомные права. При сохранении новой роли персональные права будут сброшены и
									заменены правами роли. После сохранения при необходимости откройте «Права…» и включите нужное заново.
								</AlertDescription>
							</Alert>
						)}

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div>
								<Label htmlFor="firstName">Имя</Label>
								<Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
							</div>
							<div>
								<Label htmlFor="lastName">Фамилия</Label>
								<Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
							</div>
						</div>

						<div>
							<Label htmlFor="login">Логин</Label>
							<Input
								id="login"
								value={login}
								onChange={(e) => setLogin(e.target.value)}
								placeholder="your.login"
								pattern={LOGIN_PATTERN}
								title={LOGIN_HINT}
								autoComplete="off"
								inputMode="text"
							/>
							<p className="mt-1 text-xs text-muted-foreground">{LOGIN_HINT}</p>
						</div>

						<div>
							<Label htmlFor="birthdate">Дата рождения</Label>
							<IMaskInput
								id="birthdate"
								mask="00/00/0000"
								value={birthdate}
								onAccept={(value) => setBirthdate(value)}
								placeholder="дд/мм/гггг"
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
							/>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div>
								<Label htmlFor="telegram">Telegram</Label>
								<Input
									id="telegram"
									value={telegram}
									onChange={(e) => setTelegram(e.target.value)}
									placeholder="@username или username"
								/>
							</div>
							<div>
								<Label htmlFor="phone">Телефон</Label>
								<IMaskInput
									id="phone"
									mask="+7 (000) 000-00-00"
									value={phone}
									onAccept={(value) => setPhone(value)}
									placeholder="+7 (999) 999-99-99"
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
								/>
							</div>
						</div>

						<div>
							<Label htmlFor="email">Email</Label>
							<Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
						</div>

						<div className="flex items-center justify-between rounded-md border p-3">
							<div>
								<div className="font-medium">Активирован</div>
								<div className="text-xs text-muted-foreground">Имеет доступ без инвайта</div>
							</div>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>

						<div className="space-y-2">
							<div className="mb-1 font-medium">Роль</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ButtonGroup>
										<Button variant="outline" className="justify-between">
											{triggerLabel}
										</Button>
										<Button variant="outline" className="justify-between" aria-label="Выбрать роль">
											<ChevronDownIcon />
										</Button>
									</ButtonGroup>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-64">
									<DropdownMenuLabel>Выберите роль</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuRadioGroup
										value={selectedRole ?? ''}
										onValueChange={(v) => setSelectedRole(v as RoleKey)}
									>
										{ROLES_LIST.map((r) => (
											<DropdownMenuRadioItem key={r.key} value={r.key}>
												{roleDisplayName(r.key)}
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{allGroups.length > 0 && (
							<div className="space-y-2">
								<Label className="font-medium">Группа</Label>
								<Popover open={groupsOpen} onOpenChange={setGroupsOpen} modal>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="w-full justify-between">
											<span className="min-w-0 truncate">{groupsTriggerLabel(selectedGroups)}</span>
											<ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
										<Command>
											<CommandList className="max-h-60">
												<CommandGroup>
													{allGroups.map((g) => {
														const selected = selectedGroupIds.includes(g.id)
														return (
															<CommandItem key={g.id} value={g.id} onSelect={() => toggleGroup(g.id)}>
																<Check
																	className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')}
																	aria-hidden="true"
																/>
																<span className="min-w-0 truncate">
																	{g.name}
																	<span className="text-muted-foreground">{groupItemSuffix(g.owner)}</span>
																</span>
															</CommandItem>
														)
													})}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}

						<div className="flex items-center justify-between">
							<div className="text-sm text-muted-foreground">Персональные права пользователя</div>
							<TooltipProvider>
								<Tooltip delayDuration={150}>
									<TooltipTrigger asChild>
										<span>
											<Button
												variant="secondary"
												onClick={() => setGrantsOpen(true)}
												disabled={grantsDisabled || !user}
											>
												Права…
											</Button>
										</span>
									</TooltipTrigger>
									{grantsDisabled && (
										<TooltipContent>
											Сначала сохраните изменения роли, затем настройте права пользователя
										</TooltipContent>
									)}
								</Tooltip>
							</TooltipProvider>
						</div>

						{sessionActions.visible && (
							<div className="rounded-md border p-3">
								<div className="font-medium">Сеансы и вход</div>
								<div className="mt-1 text-xs text-muted-foreground">
									Сеансы завершаются и при снятии отметки «Активирован».
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									<TooltipProvider>
										<Tooltip delayDuration={150}>
											<TooltipTrigger asChild>
												<span className="w-full mob:w-auto">
													<Button
														ref={revokeButtonRef}
														variant="outline"
														className="w-full mob:w-auto"
														onClick={() => setConfirmAction('revoke')}
														disabled={sessionActions.revokeDisabled || submitting || deleting}
													>
														<LogOut aria-hidden="true" />
														Завершить все сеансы
													</Button>
												</span>
											</TooltipTrigger>
											{sessionActions.revokeHint && <TooltipContent>{sessionActions.revokeHint}</TooltipContent>}
										</Tooltip>
									</TooltipProvider>
									<Button
										ref={clearButtonRef}
										variant="outline"
										className="w-full mob:w-auto"
										onClick={() => setConfirmAction('clear')}
										disabled={sessionActions.clearDisabled || submitting || deleting}
									>
										<LockKeyholeOpen aria-hidden="true" />
										Снять ограничение входа
									</Button>
								</div>
							</div>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>

					<DialogFooter className="gap-2">
						<div className="flex flex-1 items-center justify-between">
							<Button
								variant="destructive"
								onClick={() => setDeleteConfirmOpen(true)}
								disabled={submitting || deleting || actionPending || !user}
								className="gap-2"
							>
								<Trash2 className="h-4 w-4" />
								Удалить
							</Button>
							<div className="flex gap-2">
								<Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || deleting}>
									Отмена
								</Button>
								<Button onClick={onSubmit} disabled={submitting || deleting || actionPending || !user || !selectedRole}>
									Сохранить
								</Button>
							</div>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Модалка прав пользователя */}
			{user && <UserGrantsDialog open={grantsOpen} onOpenChange={setGrantsOpen} userId={user.id} />}

			<AlertDialog open={confirmAction === 'revoke'} onOpenChange={onConfirmOpenChange}>
				<AlertDialogContent onCloseAutoFocus={returnFocus('revoke')}>
					<AlertDialogHeader>
						<AlertDialogTitle className="font-medium">Завершить все сеансы пользователя?</AlertDialogTitle>
						<AlertDialogDescription>{withLoginBreak(revokeConfirmText(savedLogin), savedLogin)}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actionPending}>Отмена</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault()
								void runSessionAction('revoke')
							}}
							disabled={actionPending}
							className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
						>
							{pendingAction === 'revoke' ? 'Завершаем…' : 'Завершить сеансы'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={confirmAction === 'clear'} onOpenChange={onConfirmOpenChange}>
				<AlertDialogContent onCloseAutoFocus={returnFocus('clear')}>
					<AlertDialogHeader>
						<AlertDialogTitle className="font-medium">Снять ограничение входа?</AlertDialogTitle>
						<AlertDialogDescription>{withLoginBreak(clearConfirmText(savedLogin), savedLogin)}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={actionPending}>Отмена</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault()
								void runSessionAction('clear')
							}}
							disabled={actionPending}
						>
							{pendingAction === 'clear' ? 'Снимаем…' : 'Снять ограничение'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Модалка подтверждения удаления */}
			<Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
				<DialogContent aria-modal={true} aria-describedby={title} className="sm:max-w-140">
					<DialogHeader>
						<DialogTitle>Подтверждение удаления</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<p className="text-sm">
							Вы уверены, что хотите удалить пользователя{' '}
							<strong>{user?.login || user?.name || 'этого пользователя'}</strong>?
						</p>
						<p className="text-xs text-muted-foreground">
							Это действие нельзя отменить. Все связанные данные (роли, права, участие в проектах) будут удалены.
						</p>
					</div>
					<DialogFooter className="gap-2">
						<Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
							Отмена
						</Button>
						<Button variant="destructive" onClick={onDelete} disabled={deleting}>
							{deleting ? 'Удаление…' : 'Удалить'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
