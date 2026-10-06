'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { Eye, EyeOff } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import LoaderComponent from '@/components/LoaderComponent'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { normalizeLogin } from '@/lib/auth/validators'
import {
	EMPTY_CREDENTIALS_TEXT,
	loginFailure,
	NETWORK_ERROR_TEXT,
	READY_AGAIN_TEXT,
	TOO_MANY_LATER_TEXT,
	TOO_MANY_WAIT_TEXT,
	type LoginError,
} from '@/lib/session/login-errors'
import { isLoggedOutNotice, safeCallbackPath } from '@/lib/session/redirect'

const NO_ERROR: LoginError = { kind: 'none' }

function secondsLeft(until: number): number {
	return Math.ceil((until - Date.now()) / 1000)
}

export default function LoginPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { me } = useAuth()

	const callbackUrl = useMemo(() => safeCallbackPath(searchParams.get('callbackUrl')), [searchParams])
	const loggedOutShown = useRef(false)

	useEffect(() => {
		if (loggedOutShown.current || !isLoggedOutNotice(searchParams)) return
		loggedOutShown.current = true
		toast.success('Вы вышли из аккаунта')
		router.replace('/login')
	}, [router, searchParams])

	const [showPassword, setShowPassword] = useState(false)
	const [error, setError] = useState<LoginError>(NO_ERROR)
	const [remaining, setRemaining] = useState(0)
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (me) router.replace(callbackUrl)
	}, [me, router, callbackUrl])

	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) setSubmitting(false)
		}
		window.addEventListener('pageshow', onPageShow)
		return () => window.removeEventListener('pageshow', onPageShow)
	}, [])

	const waitUntil = error.kind === 'wait' ? error.until : null

	useEffect(() => {
		if (waitUntil === null) return
		const tick = () => {
			const left = secondsLeft(waitUntil)
			if (left <= 0) {
				setError({ kind: 'ready' })
				return
			}
			setRemaining(left)
		}
		const timer = window.setInterval(tick, 1000)
		return () => window.clearInterval(timer)
	}, [waitUntil])

	const handleLoginChange = (value: string) => {
		setError((current) => {
			if (current.kind === 'none') return current
			if (current.kind === 'wait' && normalizeLogin(value) === current.login) return current
			return NO_ERROR
		})
	}

	const handlePasswordChange = () => {
		setError((current) => (current.kind === 'wait' || current.kind === 'none' ? current : NO_ERROR))
	}

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (submitting || error.kind === 'wait') return
		const formData = new FormData(e.currentTarget)
		const usernameRaw = (formData.get('username') ?? '').toString()
		const passwordValue = (formData.get('password') ?? '').toString()

		const usernameValue = normalizeLogin(usernameRaw)

		if (!usernameValue || !passwordValue) {
			setError({ kind: 'text', text: EMPTY_CREDENTIALS_TEXT })
			return
		}

		setSubmitting(true)
		setError(NO_ERROR)
		let navigating = false

		try {
			const r = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username: usernameValue, password: passwordValue }),
			})

			if (!r.ok) {
				const failure = loginFailure(r.status, r.headers.get('Retry-After'), usernameValue, Date.now())
				if (failure.kind === 'wait') setRemaining(failure.initial)
				setError(failure)
				return
			}

			window.location.replace(callbackUrl)
			navigating = true
		} catch {
			setError({ kind: 'text', text: NETWORK_ERROR_TEXT })
		} finally {
			if (!navigating) setSubmitting(false)
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
							onChange={(event) => handleLoginChange(event.target.value)}
						/>

						<div className="relative">
							<Input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								autoComplete="current-password"
								required
								className="pr-10"
								onChange={handlePasswordChange}
								placeholder="Пароль"
							/>
							<button
								type="button"
								aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
								onClick={() => setShowPassword((v) => !v)}
								className="absolute inset-y-0 right-2 cursor-pointer px-1 text-muted-foreground"
							>
								{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</button>
						</div>

						{error.kind === 'text' && (
							<p role="alert" className="text-sm text-destructive">
								{error.text}
							</p>
						)}
						{error.kind === 'later' && (
							<p role="alert" className="text-sm text-destructive">
								{TOO_MANY_LATER_TEXT}
							</p>
						)}
						{error.kind === 'wait' && (
							<p className="text-sm text-destructive">
								<span aria-hidden="true">{TOO_MANY_WAIT_TEXT(remaining)}</span>
								<span role="alert" className="sr-only">
									{TOO_MANY_WAIT_TEXT(error.initial)}
								</span>
							</p>
						)}
						{error.kind === 'ready' && (
							<span role="status" className="sr-only">
								{READY_AGAIN_TEXT}
							</span>
						)}

						<Button type="submit" className="w-full" disabled={submitting || error.kind === 'wait'}>
							{submitting ? (
								<>
									<LoaderComponent className="mr-2 size-4" />
									<span className="sr-only">Вход…</span>
								</>
							) : (
								'Войти'
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
