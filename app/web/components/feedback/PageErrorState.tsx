'use client'

import { useEffect, useRef } from 'react'

import { ArrowLeft, CircleAlert, RotateCw } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

type PageErrorStateProps = {
	digest?: string
	onRetry: () => void
}

export function PageErrorState({ digest, onRetry }: PageErrorStateProps) {
	const headingRef = useRef<HTMLHeadingElement>(null)

	useEffect(() => {
		headingRef.current?.focus()
	}, [])

	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
			<CircleAlert className="size-7 text-destructive" aria-hidden="true" />
			<p className="mt-4 font-mono text-xs tracking-[0.22em] text-muted-foreground uppercase">ошибка</p>
			<h1 ref={headingRef} tabIndex={-1} className="mt-2 font-serif text-3xl leading-tight break-words outline-none">
				Не удалось загрузить страницу
			</h1>
			<p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
				Сервер не ответил или вернул ошибку. Повторите попытку. Если ошибка повторяется, обратитесь к администратору.
			</p>
			{digest ? (
				<p className="mt-2 text-xs text-muted-foreground">
					Код ошибки: <span className="font-mono break-all">{digest}</span>
				</p>
			) : null}
			<div className="mt-8 flex flex-wrap gap-2">
				<Button variant="outline" className="w-full rounded-full bg-card mob:w-auto" onClick={() => onRetry()}>
					<RotateCw className="size-4" aria-hidden="true" />
					Повторить
				</Button>
				<Button variant="outline" asChild className="w-full rounded-full bg-card mob:w-auto">
					<Link href="/dashboard">
						<ArrowLeft className="size-4" aria-hidden="true" />
						На главную
					</Link>
				</Button>
			</div>
		</section>
	)
}
