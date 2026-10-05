'use client'

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { CircleAlert, Loader2, RotateCw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { failureOf, loadErrorView } from '@/lib/http/errors'

type LoadErrorAlertProps = {
	title: string
	error: unknown
	onRetry: () => Promise<unknown> | void
	focusTarget?: RefObject<HTMLElement | null>
}

export function LoadErrorAlert({ title, error, onRetry, focusTarget }: LoadErrorAlertProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const pendingRef = useRef(false)
	const [retrying, setRetrying] = useState(false)
	const view = loadErrorView(failureOf(error))

	useLayoutEffect(() => {
		const node = rootRef.current
		const target = focusTarget?.current
		return () => {
			if (!node || !target || !node.contains(document.activeElement)) return
			target.focus()
		}
	}, [view.show, focusTarget])

	const handleRetry = async () => {
		if (pendingRef.current) return
		pendingRef.current = true
		setRetrying(true)
		try {
			await onRetry()
		} catch {
			return
		} finally {
			pendingRef.current = false
			setRetrying(false)
		}
	}

	if (!view.show) return null

	return (
		<Alert ref={rootRef} variant="destructive" className="rounded-3xl">
			<CircleAlert className="size-4" aria-hidden="true" />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>
				<p className="break-words">{view.reason}</p>
				{view.canRetry ? (
					<Button
						variant="outline"
						size="sm"
						className="mt-2 h-11 w-full rounded-full text-foreground mob:w-auto tab:h-8"
						onClick={handleRetry}
						aria-disabled={retrying}
						aria-busy={retrying}
					>
						{retrying ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<RotateCw className="size-4" aria-hidden="true" />
						)}
						Повторить
					</Button>
				) : null}
			</AlertDescription>
		</Alert>
	)
}
