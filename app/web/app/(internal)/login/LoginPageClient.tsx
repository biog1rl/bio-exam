'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

import { Eye, EyeOff } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

import LoaderComponent from '@/components/LoaderComponent'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { normalizeLogin } from '@/lib/auth/validators'
import { safeCallbackPath } from '@/lib/session/redirect'

export default function LoginPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { me } = useAuth()

	const callbackUrl = useMemo(() => safeCallbackPath(searchParams.get('callbackUrl')), [searchParams])

	const [showPassword, setShowPassword] = useState(false)
	const [error, setError] = useState('')
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (me) router.replace(callbackUrl)
	}, [me, router, callbackUrl])

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		const formData = new FormData(e.currentTarget)
		const usernameRaw = (formData.get('username') ?? '').toString()
		const passwordValue = (formData.get('password') ?? '').toString()

		const usernameValue = normalizeLogin(usernameRaw)

		if (!usernameValue || !passwordValue) {
			setError('Пожалуйста, введите логин и пароль')
			return
		}

		setSubmitting(true)
		setError('')

		try {
			const r = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username: usernameValue, password: passwordValue }),
			})

			if (!r.ok) {
				const json: unknown = await r.json().catch(() => null)
				const obj = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
				const errMsg = obj && typeof obj['error'] === 'string' ? (obj['error'] as string) : 'Неверный логин или пароль'
				setError(errMsg)
				return
			}

			window.location.assign(callbackUrl)
		} catch {
			setError('Не удалось связаться с сервером')
		} finally {
			setSubmitting(false)
		}
	}

	if (me) {
		return (
			<div className="grid h-screen place-items-center">
				<LoaderComponent className="size-6 animate-spin" />
			</div>
		)
	}

	return (
		<div className="grid min-h-screen place-items-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Авторизация</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="flex flex-col gap-6">
						<Input
							id="login"
							name="username"
							placeholder="Login"
							autoComplete="username"
							required
							onChange={() => setError('')}
						/>

						<div className="relative">
							<Input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								autoComplete="current-password"
								required
								className="pr-10"
								onChange={() => setError('')}
								placeholder="Пароль"
							/>
							<button
								type="button"
								aria-label={showPassword ? 'Hide password' : 'Show password'}
								onClick={() => setShowPassword((v) => !v)}
								className="absolute inset-y-0 right-2 cursor-pointer px-1 text-muted-foreground"
							>
								{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button type="submit" className="w-full" disabled={submitting}>
							{submitting ? <LoaderComponent className="mr-2 size-4" /> : 'Войти'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
