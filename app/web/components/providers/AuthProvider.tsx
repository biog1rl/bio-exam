'use client'

import type { RoleKey, PermissionKey, PermissionDomain, ActionOf } from '@bio-exam/rbac'
import { can as canRbac } from '@bio-exam/rbac'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Me = {
	id: string
	login: string | null
	firstName: string | null
	lastName: string | null
	avatar: string | null
	avatarCropped: string | null
	avatarColor: string | null
	initials: string | null
	avatarCropX: number | null
	avatarCropY: number | null
	avatarCropZoom: number | null
	avatarCropRotation: number | null
	avatarCropViewX: number | null
	avatarCropViewY: number | null
	roles: RoleKey[]
	perms: PermissionKey[]
}

type AuthContextValue = {
	me: Me | null
	perms: ReadonlySet<PermissionKey>
	loading: boolean
	avatarVersion: number
	refresh: () => Promise<void>
	can: {
		<D extends PermissionDomain>(domain: D, action: ActionOf<D>): boolean
		(key: PermissionKey): boolean
	}
	canKey: (key: PermissionKey) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchMeOnce(): Promise<Me | null> {
	try {
		let r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
		// Если access token истёк — попробуем обменять refresh token
		if (r.status === 401) {
			try {
				const rf = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
				if (rf.ok) {
					// повторяем запрос к /me после успешного refresh
					r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
				}
			} catch {
				// ignore
			}
		}

		if (!r.ok) return null
		const j = await r.json()
		if (!j?.ok || !j?.user?.id) return null
		return j.user as Me
	} catch {
		return null
	}
}

export function AuthProvider({ children, initialMe }: { children: React.ReactNode; initialMe?: Me | null }) {
	const [me, setMe] = useState<Me | null>(initialMe ?? null)
	const [loading, setLoading] = useState<boolean>(initialMe === undefined)
	const [avatarVersion, setAvatarVersion] = useState<number>(Date.now())

	// берём perms с сервера
	const perms = useMemo<ReadonlySet<PermissionKey>>(() => new Set((me?.perms ?? []) as PermissionKey[]), [me])

	const refresh = useCallback(async () => {
		const next = await fetchMeOnce()
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
		avatarVersion,
		refresh,
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
