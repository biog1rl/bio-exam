'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { RequestError } from '@/lib/http/request'
import { openNotification, refreshNotifications } from '@/lib/notifications/api'

type OpenState = { kind: 'loading' } | { kind: 'no_access' } | { kind: 'failed'; error: RequestError }

export default function NotificationOpenClient({ id }: { id: string }) {
	const router = useRouter()
	const startedFor = useRef<string | null>(null)
	const headingRef = useRef<HTMLHeadingElement>(null)
	const [state, setState] = useState<OpenState>({ kind: 'loading' })

	const run = useCallback(async () => {
		const result = await openNotification(id)
		if (result.kind === 'ok') {
			void refreshNotifications()
			setState({ kind: 'loading' })
			router.replace(result.href)
			return
		}
		if (result.kind === 'no_access') {
			void refreshNotifications()
			setState({ kind: 'no_access' })
			return
		}
		if (result.failure.kind !== 'network') void refreshNotifications()
		setState({ kind: 'failed', error: new RequestError(result.failure) })
	}, [id, router])

	useEffect(() => {
		if (startedFor.current === id) return
		startedFor.current = id
		void run()
	}, [id, run])

	useEffect(() => {
		if (state.kind === 'no_access') headingRef.current?.focus()
	}, [state.kind])

	if (state.kind === 'no_access') {
		return (
			<AccessDeniedState
				title="Нет доступа к материалу"
				description="Возможно, назначение снято."
				backHref="/dashboard"
				backLabel="На главную"
				headingRef={headingRef}
			/>
		)
	}

	if (state.kind === 'failed') {
		return <LoadErrorAlert title="Не удалось открыть уведомление" error={state.error} onRetry={run} />
	}

	return (
		<section
			role="status"
			className="flex items-center gap-2 rounded-4xl border border-border/80 bg-card/90 p-unit-mob text-sm text-muted-foreground tab-sm:p-unit"
		>
			<Loader2 className="size-4 animate-spin" aria-hidden="true" />
			Открываем уведомление…
		</section>
	)
}
