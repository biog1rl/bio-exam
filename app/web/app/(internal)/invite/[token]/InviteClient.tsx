'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
			const r = await fetch(`/api/auth/invites/validate/${token}`)
			if (r.ok) {
				const j = await r.json()
				setFirstName(j.firstName || '')
				setLastName(j.lastName || '')
				setLogin(j.login || '')
				setValid(true)
			} else {
				setValid(false)
			}
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
			let msg = 'Ошибка. Попробуйте позже.'
			try {
				const j = await r.json()
				if (j?.details?.fieldErrors) {
					const fe = j.details.fieldErrors as Record<string, string[] | undefined>
					const first = fe.login?.[0] || fe.password?.[0] || fe.token?.[0] || j.error
					if (first) msg = first
				} else if (j?.error) {
					msg = j.error
				}
			} catch {}
			setMsg(msg)
			return
		}

		if (r.ok) {
			setMsg('Готово! Учётная запись активирована. Выполняется вход...')

			// Автоматическая авторизация после успешной регистрации
			const loginResponse = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: loginNorm, password: pass }),
			})

			if (loginResponse.ok) {
				// Перенаправление на главную страницу после успешного входа
				window.location.href = '/dashboard'
			} else {
				setMsg('Готово! Учётная запись активирована. Теперь вы можете войти по логину.')
			}
		} else if (r.status === 404) {
			setMsg('Ссылка недействительна или уже использована.')
		} else if (r.status === 409) {
			setMsg('Такой логин уже занят, попробуйте другой.')
		} else {
			const j = await r.json().catch(() => ({}) as Record<string, string>)
			setMsg(j.error || 'Ошибка. Попробуйте позже.')
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
						<p className="text-muted-foreground mt-1 text-xs">{LOGIN_HINT}</p>
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

					{msg && <div className="text-muted-foreground text-sm">{msg}</div>}
					<Button onClick={accept}>Сохранить</Button>
				</CardContent>
			</Card>
		</div>
	)
}
