'use client'

import type { PermissionKey, RoleKey } from '@bio-exam/rbac'

import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { useAuth } from '@/components/providers/AuthProvider'
import { buildLoginRedirect } from '@/lib/session/redirect'

type AuthGuardProps = {
	children: ReactNode
	fallback?: ReactNode
	/** Все перечисленные права обязательны */
	requireAll?: PermissionKey[]
	/** Достаточно иметь хотя бы одно из перечисленных прав */
	requireAny?: PermissionKey[]
	/** Куда редиректить неавторизованного пользователя */
	redirectTo?: string
	/** Пути, на которых guard пропускается (например /login) */
	skipPaths?: string[]
	/** Префиксы путей, на которых guard пропускается (например /invite) */
	skipPathPrefixes?: string[]
}

export default function AuthGuard({
	children,
	fallback = null,
	requireAll,
	requireAny,
	redirectTo,
	skipPaths,
	skipPathPrefixes,
}: AuthGuardProps) {
	const { me, loading, sessionError, can } = useAuth()
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()

	const isSkipped = useMemo(() => {
		if (!pathname) return false
		if (Array.isArray(skipPaths) && skipPaths.includes(pathname)) return true
		if (Array.isArray(skipPathPrefixes) && skipPathPrefixes.some((prefix) => pathname.startsWith(prefix))) return true
		return false
	}, [pathname, skipPaths, skipPathPrefixes])

	useEffect(() => {
		if (!redirectTo || isSkipped || loading || me || sessionError) return
		const query = searchParams?.toString()
		const callbackUrl = `${pathname || '/'}${query ? `?${query}` : ''}`
		router.replace(buildLoginRedirect(callbackUrl))
	}, [redirectTo, isSkipped, loading, me, sessionError, pathname, router, searchParams])

	if (isSkipped) return <>{children}</>

	if (loading) return null
	if (!me) {
		const hasRequirements = Boolean(requireAll?.length || requireAny?.length)
		if (sessionError && !hasRequirements) return <>{children}</>
		return <>{fallback}</>
	}

	// === Админ-бэйпас: администратору разрешаем всё ===
	const isAdmin = (me.roles ?? []).includes('admin' as RoleKey)
	if (isAdmin) return <>{children}</>

	// === Дальше — обычные проверки прав ===
	if (Array.isArray(requireAll) && requireAll.length > 0) {
		const okAll = requireAll.every((k) => can(k))
		if (!okAll) return <>{fallback}</>
	}

	if (Array.isArray(requireAny) && requireAny.length > 0) {
		const okAny = requireAny.some((k) => can(k))
		if (!okAny) return <>{fallback}</>
	}

	return <>{children}</>
}
