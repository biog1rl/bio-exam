'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteAcceptErrorText, inviteValidationOutcome, loginAfterAcceptText } from '@/lib/auth/invite-flow'
import { LOGIN_PATTERN, LOGIN_HINT, normalizeLogin, validateLogin } from '@/lib/auth/validators'

export default function InviteClient({ token }: { token: string }) {
	const [loading, setLoading] = useState(true)
	const [valid, setValid] = useState(false)
	const [firstName, setFirstName] = useState('')
	const [lastName, setLastName] = useState('')
	const [login, setLogin] = useState('')
	const [pass, setPass] = useState('')
	const [pass2, setPass2] = useState('')
	const [msg, setMsg] = useState<string | null>(null)

	useEffect(() => {
		;(async () => {
			setLoading(true)
			const r = await fetch(`/api/auth/invites/validate/${encodeURIComponent(token)}`)
			const body: unknown = r.ok ? await r.json().catch(() => null) : null
			const outcome = inviteValidationOutcome(r.status, body)
			setFirstName(outcome.firstName)
			setLastName(outcome.lastName)
			setLogin(outcome.login)
			setValid(outcome.valid)
			setLoading(false)
		})()
	}, [token])

	async function accept() {
		setMsg(null)
		const loginNorm = normalizeLogin(login)

		const loginErr = validateLogin(loginNorm)
		if (loginErr) {
			setMsg(loginErr)
			return
		}
		if (!pass || pass !== pass2) {
			setMsg('Пароли не совпадают')
			return
		}

		const r = await fetch('/api/auth/invites/accept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, login: loginNorm, firstName, lastName, password: pass }),
		})

		if (!r.ok) {
			setMsg(inviteAcceptErrorText(await r.json().catch(() => null)))
			return
		}

		setMsg('Готово! Учётная запись активирована. Выполняется вход...')

		const loginStatus = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: loginNorm, password: pass }),
		}).then(
			(response) => response.status,
			() => 0
		)

		const loginText = loginAfterAcceptText(loginStatus)
		if (loginText === null) {
			window.location.href = '/dashboard'
		} else {
			setMsg(loginText)
		}
	}

	if (loading) return <div className="p-6">Загрузка…</div>
	if (!valid) return <div className="p-6">Ссылка недействительна (404).</div>

	return (
		<div className="flex justify-center p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Завершение регистрации</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div>
						<Label>Логин</Label>
						<Input
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

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label>Имя</Label>
							<Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
						</div>
						<div>
							<Label>Фамилия</Label>
							<Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
						</div>
					</div>

					<div>
						<Label>Пароль</Label>
						<Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
					</div>
					<div>
						<Label>Пароль ещё раз</Label>
						<Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
					</div>

					{msg && <div className="text-sm text-muted-foreground">{msg}</div>}
					<Button onClick={accept}>Сохранить</Button>
				</CardContent>
			</Card>
		</div>
	)
}
