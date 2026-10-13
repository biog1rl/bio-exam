'use client'

import { useEffect, useState } from 'react'

import { Clock3 } from 'lucide-react'

import { uploadWindowView } from '@/lib/tests/upload-window'
import { cn } from '@/lib/utils/cn'

type Props = {
	uploadClosesAt: string | null
	serverOffsetMs: number
}

export function UploadWindowLine({ uploadClosesAt, serverOffsetMs }: Props) {
	const [nowMs, setNowMs] = useState(() => Date.now() + serverOffsetMs)
	const view = uploadWindowView(uploadClosesAt, nowMs)
	const nextUpdateInMs = view.nextUpdateInMs

	useEffect(() => {
		if (nextUpdateInMs === null) return
		const handle = setTimeout(() => setNowMs(Date.now() + serverOffsetMs), nextUpdateInMs)
		return () => clearTimeout(handle)
	}, [nextUpdateInMs, nowMs, serverOffsetMs])

	useEffect(() => {
		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') setNowMs(Date.now() + serverOffsetMs)
		}
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => document.removeEventListener('visibilitychange', onVisibilityChange)
	}, [serverOffsetMs])

	if (view.state === 'none') return null
	const soon = view.state === 'closing' || view.state === 'last-minute'

	return (
		<div>
			{view.state === 'closed' ? (
				<p className="mt-2 text-sm text-muted-foreground">{view.closedText}</p>
			) : (
				<p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
					<span className="text-foreground" aria-hidden="true">
						{view.until}
					</span>
					<span
						aria-hidden="true"
						className={cn(
							'mt-1 basis-full mob:mt-0 mob:basis-auto',
							soon ? 'inline-flex items-center gap-1 font-medium text-foreground' : 'text-muted-foreground'
						)}
					>
						{soon ? <Clock3 className="size-4" aria-hidden="true" /> : null}
						{view.countdown}
					</span>
					<span className="sr-only">{view.srText}</span>
				</p>
			)}
			<span className="sr-only" aria-live="polite">
				{view.liveText}
			</span>
		</div>
	)
}
