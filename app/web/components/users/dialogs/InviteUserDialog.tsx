'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'

import { Copy, Check } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { LOGIN_PATTERN, LOGIN_HINT, normalizeLogin, validateLogin } from '@/lib/auth/validators'
import { groupsKeys, groupsListFetcher } from '@/lib/groups/api'
import type { RequestFailure } from '@/lib/http/request'
import {
	defaultGroupId,
	defaultRoleKey,
	groupOwnerLabel,
	inviteErrorText,
	invitePayload,
	parseInviteGroups,
	showGroupField,
	type InviteVariant,
} from '@/lib/users/invite-form'
import { createInvite } from '@/lib/users/invites-api'
import { useRoleTraits } from '@/lib/users/role-traits'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	onCreated: () => void
}

type FormProps = {
	onClose: () => void
	onCreated: () => void
}

type InviteFields = {
	login: string
	firstName: string
	lastName: string
	role: string | null
	groupId: string | null
}

const NO_GROUP = '__none__'
const MISSING_LINK_TEXT = 'Сервис не вернул ссылку приглашения'

function inviteFailureText(failure: RequestFailure, variant: InviteVariant): string | null {
	switch (failure.kind) {
		case 'http':
			return inviteErrorText({ status: failure.status, body: failure.body, variant })
		case 'network':
			return inviteErrorText({ network: true })
		case 'malformed':
			return MISSING_LINK_TEXT
		default:
			return null
	}
}

function useInviteGroups() {
	const { data, error } = useSWR(groupsKeys.list(), groupsListFetcher)
	const groups = useMemo(() => parseInviteGroups(error ? undefined : data), [data, error])
	return { groups, loaded: data !== undefined && !error }
}

function useInviteRequest(variant: InviteVariant, onCreated: () => void) {
	const [inviteLink, setInviteLink] = useState<string | null>(null)
	const [loading, setLoading] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)

	async function submit(fields: InviteFields): Promise<boolean> {
		setLoading(true)
		setError(null)
		setInviteLink(null)

		try {
			const loginNorm = normalizeLogin(fields.login)
			const loginErr = validateLogin(loginNorm)
			if (loginErr) {
				setError(loginErr)
				return false
			}

			const outcome = await createInvite(
				invitePayload({
					variant,
					role: fields.role,
					groupId: fields.groupId,
					login: loginNorm,
					firstName: fields.firstName,
					lastName: fields.lastName,
				})
			)

			if (!outcome.ok) {
				setError(inviteFailureText(outcome, variant))
				return false
			}

			setInviteLink(outcome.data.inviteLink)
			onCreated()
			return true
		} finally {
			setLoading(false)
		}
	}

	return { inviteLink, loading, error, submit }
}

function NameLoginFields({
	firstName,
	lastName,
	login,
	onFirstName,
	onLastName,
	onLogin,
}: {
	firstName: string
	lastName: string
	login: string
	onFirstName: (v: string) => void
	onLastName: (v: string) => void
	onLogin: (v: string) => void
}) {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<Label htmlFor="firstName">Имя</Label>
					<Input
						id="firstName"
						value={firstName}
						onChange={(e) => onFirstName(e.target.value)}
						placeholder="Иван"
						autoComplete="off"
						inputMode="text"
					/>
				</div>
				<div>
					<Label htmlFor="lastName">Фамилия</Label>
					<Input
						id="lastName"
						value={lastName}
						onChange={(e) => onLastName(e.target.value)}
						placeholder="Иванов"
						autoComplete="off"
					/>
				</div>
			</div>

			<div>
				<Label htmlFor="login">Логин</Label>
				<Input
					id="login"
					value={login}
					onChange={(e) => onLogin(e.target.value)}
					placeholder="your.login"
					pattern={LOGIN_PATTERN}
					title={LOGIN_HINT}
					autoComplete="off"
					inputMode="text"
				/>
				<p className="mt-1 text-xs text-muted-foreground">{LOGIN_HINT}</p>
			</div>
		</>
	)
}

function InviteError({ error }: { error: string | null }) {
	if (!error) return null
	return (
		<div className="text-sm text-destructive" role="alert">
			{error}
		</div>
	)
}

function InviteLinkBlock({ inviteLink, children }: { inviteLink: string; children?: ReactNode }) {
	const [copied, setCopied] = useState<boolean>(false)
	const inputRef = useRef<HTMLInputElement>(null)

	async function copyLink(): Promise<void> {
		inputRef.current?.focus()
		inputRef.current?.select()
		inputRef.current?.setSelectionRange(0, inviteLink.length)

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(inviteLink)
			} else {
				document.execCommand('copy')
			}
			setCopied(true)
			toast.success('Ссылка скопирована.')
			setTimeout(() => setCopied(false), 1500)
		} catch {
			toast.error('Не удалось скопировать ссылку.')
		}
	}

	return (
		<>
			<Separator />
			<div className="space-y-2">
				<div className="text-sm text-muted-foreground">Отправьте пользователю эту одноразовую ссылку:</div>
				<div className="flex gap-2">
					<Input ref={inputRef} readOnly value={inviteLink} className="min-w-0 flex-1" />
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={copyLink}
						title={copied ? 'Скопировано!' : 'Копировать'}
						aria-label={copied ? 'Скопировано!' : 'Копировать'}
					>
						{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
					</Button>
				</div>
				<div className="text-xs text-muted-foreground">Ссылка действует 7 дней и одноразовая.</div>
				{children}
			</div>
		</>
	)
}

function TeacherInviteForm({ onClose, onCreated }: FormProps) {
	const { groups, loaded } = useInviteGroups()
	const { inviteLink, loading, error, submit } = useInviteRequest('teacher', onCreated)

	const [login, setLogin] = useState<string>('')
	const [firstName, setFirstName] = useState<string>('')
	const [lastName, setLastName] = useState<string>('')
	const [groupChoice, setGroupChoice] = useState<string | null>(null)

	const groupId = groupChoice ?? defaultGroupId(groups)

	return (
		<>
			<DialogHeader>
				<DialogTitle>Пригласить ученика</DialogTitle>
				<DialogDescription>Ученик сразу попадёт в выбранную группу. Роль — «Ученик».</DialogDescription>
			</DialogHeader>

			{loaded && groups.length === 0 ? (
				<div className="grid gap-3">
					<p className="text-sm text-muted-foreground">
						Сначала создайте группу: приглашённый ученик сразу попадает в неё.
					</p>
					<div className="flex flex-col gap-2">
						<Button asChild variant="outline" className="w-full">
							<Link href="/admin/groups">К группам</Link>
						</Button>
						<Button variant="outline" className="w-full" onClick={onClose}>
							Закрыть
						</Button>
					</div>
				</div>
			) : (
				<div className="grid gap-3">
					<NameLoginFields
						firstName={firstName}
						lastName={lastName}
						login={login}
						onFirstName={setFirstName}
						onLastName={setLastName}
						onLogin={setLogin}
					/>

					<div>
						<Label htmlFor="invite-group">Группа</Label>
						<Select value={groupId ?? ''} onValueChange={setGroupChoice}>
							<SelectTrigger id="invite-group" className="w-full">
								<SelectValue placeholder="Выберите группу" />
							</SelectTrigger>
							<SelectContent>
								{groups.map((g) => (
									<SelectItem key={g.id} value={g.id}>
										<span className="truncate">{g.name}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<InviteError error={error} />

					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => void submit({ login, firstName, lastName, role: null, groupId })}
							disabled={loading || !groupId}
						>
							{loading ? 'Приглашаем…' : 'Пригласить ученика'}
						</Button>
						<Button variant="outline" onClick={onClose}>
							Закрыть
						</Button>
					</div>

					{inviteLink && <InviteLinkBlock inviteLink={inviteLink} />}
				</div>
			)}
		</>
	)
}

function AdminInviteForm({ onClose, onCreated }: FormProps) {
	const { roles: roleTraits } = useRoleTraits()
	const { groups } = useInviteGroups()
	const { inviteLink, loading, error, submit } = useInviteRequest('admin', onCreated)

	const [login, setLogin] = useState<string>('')
	const [firstName, setFirstName] = useState<string>('')
	const [lastName, setLastName] = useState<string>('')
	const [roleChoice, setRoleChoice] = useState<string | null>(null)
	const [groupChoice, setGroupChoice] = useState<string | null>(null)
	const [createdOwnsZone, setCreatedOwnsZone] = useState<boolean>(false)

	const role = roleChoice ?? defaultRoleKey(roleTraits)
	const selectedTrait = role ? roleTraits.find((trait) => trait.key === role) : undefined
	const groupVisible = showGroupField(selectedTrait?.groupMember)
	const groupId = groupVisible ? groupChoice : null

	async function handleSubmit(): Promise<void> {
		const ownsZone = selectedTrait?.ownsZone === true
		setCreatedOwnsZone(false)
		const ok = await submit({ login, firstName, lastName, role, groupId })
		if (ok) setCreatedOwnsZone(ownsZone)
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>Создать пользователя</DialogTitle>
			</DialogHeader>

			<div className="grid gap-3">
				<NameLoginFields
					firstName={firstName}
					lastName={lastName}
					login={login}
					onFirstName={setFirstName}
					onLastName={setLastName}
					onLogin={setLogin}
				/>

				<div>
					<Label htmlFor="invite-role">Роль</Label>
					<Select value={role ?? ''} onValueChange={setRoleChoice}>
						<SelectTrigger id="invite-role" className="w-full">
							<SelectValue placeholder="Выберите роль" />
						</SelectTrigger>
						<SelectContent>
							{roleTraits.map((r) => (
								<SelectItem key={r.key} value={r.key}>
									{r.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{groupVisible && (
					<div>
						<Label htmlFor="invite-group">Группа</Label>
						<Select value={groupChoice ?? NO_GROUP} onValueChange={(v) => setGroupChoice(v === NO_GROUP ? null : v)}>
							<SelectTrigger id="invite-group" className="w-full">
								<SelectValue placeholder="Без группы" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_GROUP}>Без группы</SelectItem>
								{groups.map((g) => {
									const owner = groupOwnerLabel(g.owner)
									return (
										<SelectItem key={g.id} value={g.id}>
											<span className="truncate">
												{g.name}
												{owner !== null && <span className="text-muted-foreground"> · {owner}</span>}
											</span>
										</SelectItem>
									)
								})}
							</SelectContent>
						</Select>
					</div>
				)}

				<InviteError error={error} />

				<div className="flex flex-wrap gap-2">
					<Button onClick={() => void handleSubmit()} disabled={loading || !role}>
						{loading ? 'Создание…' : 'Создать приглашение'}
					</Button>
					<Button variant="outline" onClick={onClose}>
						Закрыть
					</Button>
				</div>

				{inviteLink && (
					<InviteLinkBlock inviteLink={inviteLink}>
						{createdOwnsZone && (
							<p className="text-xs text-muted-foreground">
								Закрепите за учителем темы в форме темы и назначьте его владельцем групп.
							</p>
						)}
					</InviteLinkBlock>
				)}
			</div>
		</>
	)
}

export function InviteUserDialog({ open, onOpenChange, onCreated }: Props) {
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const close = () => onOpenChange(false)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
				{zoneAll ? (
					<AdminInviteForm onClose={close} onCreated={onCreated} />
				) : (
					<TeacherInviteForm onClose={close} onCreated={onCreated} />
				)}
			</DialogContent>
		</Dialog>
	)
}
