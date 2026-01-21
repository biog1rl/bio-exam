'use client'

import { ROLES_LIST, roleDisplayName, type RoleKey } from '@bio-exam/rbac'

import { useMemo, useRef, useState } from 'react'

import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { LOGIN_PATTERN, LOGIN_HINT, normalizeLogin, validateLogin } from '@/lib/auth/validators'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	onCreated: () => void
}

export function InviteUserDialog({ open, onOpenChange, onCreated }: Props) {
	const roles = ROLES_LIST
	const defaultRole: RoleKey = useMemo(() => (roles.find(Boolean)?.key ?? 'specialist') as RoleKey, [roles])

	const [login, setLogin] = useState<string>('')
	const [firstName, setFirstName] = useState<string>('')
	const [lastName, setLastName] = useState<string>('')
	const [position, setPosition] = useState<string>('')
	const [showInTeam, setShowInTeam] = useState<boolean>(true)
	const [role, setRole] = useState<RoleKey>(defaultRole)
	const [inviteLink, setInviteLink] = useState<string | null>(null)
	const [loading, setLoading] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState<boolean>(false)
	const inputRef = useRef<HTMLInputElement>(null)

	async function createInvite(): Promise<void> {
		setLoading(true)
		setError(null)
		setInviteLink(null)

		try {
			const loginNorm = normalizeLogin(login)
			const loginErr = validateLogin(loginNorm)
			if (loginErr) throw new Error(loginErr)

			const res = await fetch('/api/auth/invites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ login: loginNorm, firstName, lastName, position, roleKey: role, showInTeam }),
			})

			const json: unknown = await res.json().catch(() => null)
			const data = (json ?? {}) as { inviteLink?: string; error?: string }

			if (!res.ok) {
				throw new Error(data.error || `HTTP ${res.status}`)
			}

			if (!data.inviteLink) {
				throw new Error('Сервис не вернул ссылку приглашения')
			}

			setInviteLink(data.inviteLink)
			onCreated()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
		} finally {
			setLoading(false)
		}
	}

	async function copyLink(): Promise<void> {
		if (!inviteLink) return
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Создать пользователя</DialogTitle>
				</DialogHeader>

				<div className="grid gap-3">
					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="firstName">Имя</Label>
							<Input
								id="firstName"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
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
								onChange={(e) => setLastName(e.target.value)}
								placeholder="Иванов"
								autoComplete="off"
							/>
						</div>
					</div>

					<div>
						<Label htmlFor="login">Логин</Label>
						<Input
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
							autoComplete="off"
						/>
					</div>

					<Label className="bg-input/30 border-input flex cursor-pointer items-center justify-between gap-x-4 rounded-md border px-3 py-2">
						<span>Показывать в команде</span>
						<Switch id="showInTeam" checked={showInTeam} onCheckedChange={(v) => setShowInTeam(v)} />
					</Label>

					<div>
						<Label>Роль</Label>
						<Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
							<SelectTrigger>
								<SelectValue placeholder="Выберите роль" />
							</SelectTrigger>
							<SelectContent>
								{roles.map((r) => (
									<SelectItem key={r.key} value={r.key}>
										{roleDisplayName(r.key)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{error && <div className="text-sm text-red-600">{error}</div>}

					<div className="flex gap-2">
						<Button onClick={createInvite} disabled={loading}>
							{loading ? 'Создание…' : 'Создать'}
						</Button>
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Закрыть
						</Button>
					</div>

					{inviteLink && (
						<>
							<Separator />
							<div className="space-y-2">
								<div className="text-muted-foreground text-sm">Отправьте пользователю эту одноразовую ссылку:</div>
								<div className="flex gap-2">
									<Input ref={inputRef} readOnly value={inviteLink} className="flex-1" />
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={copyLink}
										title={copied ? 'Скопировано!' : 'Копировать'}
									>
										{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
									</Button>
								</div>
								<div className="text-muted-foreground text-xs">Ссылка действует 7 дней и одноразовая.</div>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
