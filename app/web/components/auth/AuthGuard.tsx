'use client'

import { canAccessSection, sectionForPath } from '@bio-exam/rbac'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { useAuth } from '@/components/providers/AuthProvider'
import { buildLoginRedirect } from '@/lib/session/redirect'

type AuthGuardProps = {
	children: ReactNode
	fallback?: ReactNode
	redirectTo?: string
	skipPaths?: string[]
	skipPathPrefixes?: string[]
}

export default function AuthGuard({
	children,
	fallback = null,
	redirectTo,
	skipPaths,
	skipPathPrefixes,
}: AuthGuardProps) {
	const { me, loading, sessionError, perms } = useAuth()
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const refreshedFor = useRef<string | null>(null)

	const isSkipped = useMemo(() => {
		if (!pathname) return false
		if (Array.isArray(skipPaths) && skipPaths.includes(pathname)) return true
		if (Array.isArray(skipPathPrefixes) && skipPathPrefixes.some((prefix) => pathname.startsWith(prefix))) return true
		return false
	}, [pathname, skipPaths, skipPathPrefixes])

	const permsKey = useMemo(() => [...perms].sort().join(','), [perms])
	const section = redirectTo && pathname ? sectionForPath(pathname) : null
	const sectionDenied = Boolean(me && section && !canAccessSection(perms, section))

	useEffect(() => {
		if (!redirectTo || isSkipped || loading || me || sessionError) return
		const query = searchParams?.toString()
		const callbackUrl = `${pathname || '/'}${query ? `?${query}` : ''}`
		router.replace(buildLoginRedirect(callbackUrl))
	}, [redirectTo, isSkipped, loading, me, sessionError, pathname, router, searchParams])

	useEffect(() => {
		if (!sectionDenied || isSkipped || loading) return
		if (refreshedFor.current === permsKey) return
		refreshedFor.current = permsKey
		router.refresh()
	}, [sectionDenied, isSkipped, loading, permsKey, router])

	if (isSkipped) return <>{children}</>

	if (loading) return null
	if (!me) {
		if (sessionError) return <>{children}</>
		return <>{fallback}</>
	}

	return <>{children}</>
}
