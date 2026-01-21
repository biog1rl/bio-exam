'use client'

import { useEffect, useRef, useState } from 'react'

import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { UserRow } from '@/types/users'

type Props = {
	open: boolean
	onOpenChange: (v: boolean) => void
	user: UserRow | null
	onIssued?: () => void
}

type InviteResponse = { inviteLink: string; userId: string }

export function ReinviteUserDialog({ open, onOpenChange, user, onIssued }: Props) {
	const { mutate } = useSWRConfig()
	const [loading, setLoading] = useState(false)
	const [inviteLink, setInviteLink] = useState<string>('')
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!open) {
			setInviteLink('')
			setError(null)
		}
	}, [open])

	async function issueLink() {
		if (!user) return
		setLoading(true)
		setError(null)
		try {
			const res = await fetch('/api/auth/invites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: user.id }),
			})

			if (!res.ok) {
				const msg = await res.text().catch(() => '')
				throw new Error(msg || `HTTP ${res.status}`)
			}

			const json = (await res.json()) as InviteResponse
			setInviteLink(json.inviteLink)
			await mutate('/api/users')
			onIssued?.()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
		} finally {
			setLoading(false)
		}
	}

	async function copyLink() {
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

	const waitingActivation = user ? !(user.isActive === true || user.isActive === 1) : false

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Новая инвайт-ссылка {user ? `для ${user.login}` : ''}</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					{!waitingActivation && (
						<p className="text-muted-foreground text-sm">
							Пользователь уже активирован. Создание новой ссылки не требуется.
						</p>
					)}

					{inviteLink ? (
						<div className="space-y-2">
							<div className="flex gap-2">
								<Input ref={inputRef} value={inviteLink} readOnly className="flex-1" />
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
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							Сгенерируйте новую одноразовую ссылку для активации аккаунта.
						</p>
					)}

					{error && <p className="text-destructive text-sm">{error}</p>}
				</div>

				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
						Закрыть
					</Button>
					<Button onClick={issueLink} disabled={loading || !user || !waitingActivation}>
						Сгенерировать
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
