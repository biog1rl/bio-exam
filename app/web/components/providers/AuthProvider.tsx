'use client'

import type { PermissionKey, PermissionDomain, ActionOf } from '@bio-exam/rbac'
import { can as canRbac } from '@bio-exam/rbac'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { sessionClient, type AuthMe, type LoadMeOutcome } from '@/lib/session/client'
import { createKeepAlive, type KeepAlive } from '@/lib/session/keep-alive'
import { LOGGED_OUT_PATH } from '@/lib/session/redirect'

type Me = AuthMe

type AuthContextValue = {
	me: Me | null
	perms: ReadonlySet<PermissionKey>
	loading: boolean
	sessionError: boolean
	avatarVersion: number
	refresh: () => Promise<void>
	logout: () => Promise<boolean>
	can: {
		<D extends PermissionDomain>(domain: D, action: ActionOf<D>): boolean
		(key: PermissionKey): boolean
	}
	canKey: (key: PermissionKey) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchMeOnce(): Promise<LoadMeOutcome> {
	try {
		return await sessionClient.loadMe()
	} catch {
		return { kind: 'unavailable' }
	}
}

export function AuthProvider({
	children,
	initialMe,
	sessionError: initialSessionError = false,
}: {
	children: React.ReactNode
	initialMe?: Me | null
	sessionError?: boolean
}) {
	const [me, setMe] = useState<Me | null>(initialMe ?? null)
	const [loading, setLoading] = useState<boolean>(initialMe === undefined)
	const [sessionError, setSessionError] = useState<boolean>(initialSessionError)
	const [avatarVersion, setAvatarVersion] = useState<number>(Date.now())

	// берём perms с сервера
	const perms = useMemo<ReadonlySet<PermissionKey>>(() => new Set((me?.perms ?? []) as PermissionKey[]), [me?.perms])

	const refresh = useCallback(async () => {
		const outcome = await fetchMeOnce()
		if (outcome.kind === 'unavailable') {
			setLoading(false)
			return
		}
		const next = outcome.kind === 'ok' ? outcome.me : null
		const newVersion = Date.now()

		// Предзагружаем изображение перед обновлением состояния для плавного перехода
		const newAvatarUrl = next?.avatarCropped || next?.avatar
		if (newAvatarUrl) {
			await new Promise<void>((resolve) => {
				const img = new Image()
				img.onload = img.onerror = () => resolve()
				img.src = `${newAvatarUrl}?v=${newVersion}`
			})
		}

		setMe(next)
		setSessionError(false)
		setAvatarVersion(newVersion)
		setLoading(false) // Завершаем загрузку (актуально только для первого раза)
		localStorage.setItem('lastAuthUpdate', Date.now().toString())
	}, [])

	useEffect(() => {
		if (initialMe === undefined) {
			void refresh()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const accessExpiresAt = me?.accessExpiresAt ?? null
	const keepAliveRef = useRef<KeepAlive | null>(null)

	useEffect(() => {
		const keepAlive = createKeepAlive({
			refresh: () => sessionClient.refreshOnce(),
			onRefreshed: (nextExpiresAt) => {
				setMe((current) => (current ? { ...current, accessExpiresAt: nextExpiresAt } : current))
			},
			onSessionEnded: () => {
				void refresh()
			},
			doc: document,
		})
		keepAliveRef.current = keepAlive
		return () => {
			keepAlive.stop()
			keepAliveRef.current = null
		}
	}, [refresh])

	useEffect(() => {
		keepAliveRef.current?.update(accessExpiresAt)
	}, [accessExpiresAt])

	const logout = useCallback(async () => {
		if (!(await sessionClient.logout())) return false
		setMe(null)
		localStorage.setItem('logout', Date.now().toString())
		localStorage.removeItem('logout')
		window.location.assign(LOGGED_OUT_PATH)
		return true
	}, [])

	// Автоматический рефреш при разлогинивании
	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'logout' || e.key === 'auth-change' || e.key === 'avatar-changed') {
				void refresh()
			}
		}

		const handleVisibilityChange = () => {
			// При возвращении на вкладку проверяем авторизацию только если прошло больше 5 минут
			if (document.visibilityState === 'visible') {
				const lastUpdate = localStorage.getItem('lastAuthUpdate')
				const now = Date.now()
				const fiveMinutes = 5 * 60 * 1000

				if (!lastUpdate || now - parseInt(lastUpdate) > fiveMinutes) {
					void refresh()
				}
			}
		}

		// Периодическая проверка авторизации каждые 10 минут (вместо 30 секунд!)
		const intervalId = setInterval(
			() => {
				if (document.visibilityState === 'visible') {
					void refresh()
				}
			},
			10 * 60 * 1000
		) // 10 минут

		// Слушаем изменения в localStorage
		window.addEventListener('storage', handleStorageChange)
		// Слушаем изменения видимости вкладки
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			clearInterval(intervalId)
			window.removeEventListener('storage', handleStorageChange)
			document.removeEventListener('visibilitychange', handleVisibilityChange)
		}
	}, [refresh])

	function canOverload(a: unknown, b?: unknown): boolean {
		if (typeof a === 'string' && b === undefined) {
			return canRbac(perms, a as PermissionKey)
		}
		if (typeof a === 'string' && typeof b === 'string') {
			return canRbac(perms, a as PermissionDomain, b as ActionOf<PermissionDomain>)
		}
		return false
	}

	const value: AuthContextValue = {
		me,
		perms,
		loading,
		sessionError,
		avatarVersion,
		refresh,
		logout,
		can: canOverload as AuthContextValue['can'],
		canKey: (key: PermissionKey) => canRbac(perms, key),
	}

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
	return ctx
}
