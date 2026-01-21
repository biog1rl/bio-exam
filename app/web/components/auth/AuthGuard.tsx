'use client'

import type { PermissionKey, RoleKey } from '@bio-exam/rbac'

import type { ReactNode } from 'react'

import { useAuth } from '@/components/providers/AuthProvider'

type AuthGuardProps = {
	children: ReactNode
	fallback?: ReactNode
	/** Все перечисленные права обязательны */
	requireAll?: PermissionKey[]
	/** Достаточно иметь хотя бы одно из перечисленных прав */
	requireAny?: PermissionKey[]
}

export default function AuthGuard({ children, fallback = null, requireAll, requireAny }: AuthGuardProps) {
	const { me, loading, can } = useAuth()

	if (loading) return null
	if (!me) return <>{fallback}</>

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
