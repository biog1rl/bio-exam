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

function safeRedirect(url?: string | null) {
	if (!url) return '/'
	let decoded = url
	try {
		decoded = decodeURIComponent(url)
	} catch {
		/* ignore */
	}
	if (decoded.startsWith('/')) return decoded
	if (typeof window !== 'undefined') {
		try {
			const u = new URL(decoded, window.location.origin)
			if (u.origin === window.location.origin) {
				return `${u.pathname}${u.search}${u.hash || ''}` || '/'
			}
		} catch {
			/* ignore */
		}
	}
	return '/'
}

async function fetchMe(): Promise<boolean> {
	try {
		let r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
		if (r.status === 401) {
			const rf = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
			if (rf.ok) {
				r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
			}
		}
		if (!r.ok) return false
		const j: unknown = await r.json()
		const obj = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
		const ok = obj && obj['ok'] === true
		const user =
			obj && typeof obj['user'] === 'object' && obj['user'] !== null ? (obj['user'] as Record<string, unknown>) : null
		const id = user && typeof user['id'] === 'string' ? user['id'] : null
		return Boolean(ok && id)
	} catch {
		return false
	}
}

export default function LoginPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { refresh } = useAuth()

	const callbackUrl = useMemo(
		() =>
			searchParams.get('callbackUrl') ||
			searchParams.get('from') ||
			searchParams.get('next') ||
			searchParams.get('redirectTo') ||
			searchParams.get('returnTo') ||
			searchParams.get('redirect') ||
			'/dashboard',
		[searchParams]
	)

	const [bootLoading, setBootLoading] = useState(true)
	const [showPassword, setShowPassword] = useState(false)
	const [error, setError] = useState('')
	const [submitting, setSubmitting] = useState(false)

	// если уже авторизован через cookie — редиректим
	useEffect(() => {
		;(async () => {
			const ok = await fetchMe()
			if (ok) router.replace(safeRedirect(callbackUrl))
			else setBootLoading(false)
		})()
	}, [router, callbackUrl])

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

			// Обновляем состояние авторизации после успешного входа
			await refresh()
			const target = safeRedirect(callbackUrl)
			const isReady = await fetchMe()
			if (!isReady) {
				setError('Сессия не установилась. Обновите страницу и попробуйте снова.')
				return
			}
			window.location.assign(target)
		} catch {
			setError('Не удалось связаться с сервером')
		} finally {
			setSubmitting(false)
		}
	}

	if (bootLoading) {
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
								className="text-muted-foreground absolute inset-y-0 right-2 cursor-pointer px-1"
							>
								{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<Button type="submit" className="w-full" disabled={submitting}>
							{submitting ? <LoaderComponent className="mr-2 size-4" /> : 'Войти'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
