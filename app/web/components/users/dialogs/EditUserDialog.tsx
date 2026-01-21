'use client'

import { ROLES_LIST, ROLE_KEYS, roleDisplayName, type RoleKey } from '@bio-exam/rbac'

import { useEffect, useMemo, useState } from 'react'
import { IMaskInput } from 'react-imask'

import { ChevronDownIcon, ShieldCheck, Trash2 } from 'lucide-react'
import useSWR, { useSWRConfig } from 'swr'

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
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
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UserGrantsDialog } from '@/components/users/dialogs/UserGrantsDialog'
import { LOGIN_PATTERN, LOGIN_HINT } from '@/lib/auth/validators'
import type { UserRow } from '@/types/users'

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

export function EditUserDialog({ open, onOpenChange, user, onSaved }: Props) {
	const { mutate } = useSWRConfig()

	const [firstName, setFirstName] = useState<string>('')
	const [lastName, setLastName] = useState<string>('')
	const [login, setLogin] = useState<string>('')
	const [position, setPosition] = useState<string>('')
	const [isActive, setIsActive] = useState<boolean>(false)
	const [birthdate, setBirthdate] = useState<string>('')
	const [telegram, setTelegram] = useState<string>('')
	const [phone, setPhone] = useState<string>('')
	const [email, setEmail] = useState<string>('')
	const [showInTeam, setShowInTeam] = useState<boolean>(false)

	// выбранная роль и исходная роль (для сравнения)
	const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null)
	const [initialRole, setInitialRole] = useState<RoleKey | null>(null)

	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

	// модалка кастомных прав
	const [grantsOpen, setGrantsOpen] = useState(false)

	// грузим информацию о персональных override'ах пользователя, чтобы показать предупреждение
	const enabled = open && !!user?.id
	const { data: grantsMeta } = useSWR<GrantsResponse>(enabled ? `/api/rbac/user/${user!.id}/grants` : null, fetcher)
	const hasCustomOverrides = (grantsMeta?.userOverrides?.length ?? 0) > 0

	useEffect(() => {
		if (!open || !user) return
		setFirstName(user.firstName ?? '')
		setLastName(user.lastName ?? '')
		setLogin(user.login ?? '')
		setPosition(user.position ?? '')
		setIsActive(Boolean(user.isActive))

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
		setShowInTeam(Boolean(user.showInTeam))

		// берём ПЕРВУЮ валидную роль из пользователя
		const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
		const firstValid = (user.roles ?? []).find((r) => allow.has(r)) as RoleKey | undefined
		setSelectedRole(firstValid ?? null)
		setInitialRole(firstValid ?? null)

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

			const payload: {
				firstName?: string
				lastName?: string
				login?: string
				position?: string
				isActive?: boolean
				roles: string[]
				birthdate?: string | null
				telegram?: string
				phone?: string
				email?: string
				showInTeam?: boolean
			} = {
				firstName,
				lastName,
				login,
				position,
				isActive,
				roles: [selectedRole],
				birthdate: birthdate || null,
				telegram,
				phone,
				email,
				showInTeam,
			}

			const res = await fetch(`/api/users/${user.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
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
			const res = await fetch(`/api/users/${user.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
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

	const triggerLabel = selectedRole ? roleDisplayName(selectedRole) : 'Выберите роль'
	const grantsDisabled = roleChanged // нельзя открывать, пока роль не сохранена

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					aria-modal={true}
					aria-describedby={title}
					className="max-h-dvh overflow-y-auto sm:max-w-[560px]"
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
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
							<p className="text-muted-foreground mt-1 text-xs">{LOGIN_HINT}</p>
						</div>

						<div>
							<Label htmlFor="position">Должность</Label>
							<Input
								id="position"
								value={position}
								onChange={(e) => setPosition(e.target.value)}
								placeholder="Frontend Developer, Designer, Client и т.д."
							/>
						</div>

						<div>
							<Label htmlFor="birthdate">Дата рождения</Label>
							<IMaskInput
								id="birthdate"
								mask="00/00/0000"
								value={birthdate}
								onAccept={(value) => setBirthdate(value)}
								placeholder="дд/мм/гггг"
								className="border-input file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
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
									className="border-input file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
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
								<div className="text-muted-foreground text-xs">Имеет доступ без инвайта</div>
							</div>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>

						<div className="flex items-center justify-between rounded-md border p-3">
							<div>
								<div className="font-medium">Отображать в команде</div>
								<div className="text-muted-foreground text-xs">Показывать на странице сотрудников</div>
							</div>
							<Switch checked={showInTeam} onCheckedChange={setShowInTeam} />
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

						<div className="flex items-center justify-between">
							<div className="text-muted-foreground text-sm">Персональные права пользователя</div>
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

						{error && <p className="text-destructive text-sm">{error}</p>}
					</div>

					<DialogFooter className="gap-2">
						<div className="flex flex-1 items-center justify-between">
							<Button
								variant="destructive"
								onClick={() => setDeleteConfirmOpen(true)}
								disabled={submitting || deleting || !user}
								className="gap-2"
							>
								<Trash2 className="h-4 w-4" />
								Удалить
							</Button>
							<div className="flex gap-2">
								<Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || deleting}>
									Отмена
								</Button>
								<Button onClick={onSubmit} disabled={submitting || deleting || !user || !selectedRole}>
									Сохранить
								</Button>
							</div>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Модалка прав пользователя */}
			{user && <UserGrantsDialog open={grantsOpen} onOpenChange={setGrantsOpen} userId={user.id} />}

			{/* Модалка подтверждения удаления */}
			<Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
				<DialogContent aria-modal={true} aria-describedby={title} className="sm:max-w-[560px]">
					<DialogHeader>
						<DialogTitle>Подтверждение удаления</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<p className="text-sm">
							Вы уверены, что хотите удалить пользователя{' '}
							<strong>{user?.login || user?.name || 'этого пользователя'}</strong>?
						</p>
						<p className="text-muted-foreground text-xs">
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
