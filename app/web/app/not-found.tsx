'use client'

import { ArrowLeft, Home } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { HOME_PATH, backAction } from '@/lib/navigation/paths'

export default function NotFound() {
	const router = useRouter()
	const pathname = usePathname() || '/'

	const handleBack = () => {
		const navigation = (window as { navigation?: { canGoBack?: boolean } }).navigation
		const action = backAction(pathname, navigation?.canGoBack ?? window.history.length > 1)
		if (action.kind === 'history') router.back()
		else router.push(action.href)
	}

	return (
		<div className="flex min-h-[70dvh] flex-col items-center justify-center gap-unit-mob px-4 text-center tab-sm:gap-unit">
			<Image src="/img/not-found.png" alt="" width={220} height={220} className="h-auto w-40 tab-sm:w-56" priority />
			<div className="max-w-xl">
				<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">ошибка 404</p>
				<h1 className="mt-2 font-serif text-4xl leading-tight text-balance text-foreground tab-sm:text-5xl">
					Страница не найдена
				</h1>
				<p className="mt-4 text-base leading-7 text-pretty text-muted-foreground">
					Адрес набран с ошибкой, страницу удалили или она вам недоступна.
				</p>
			</div>
			<div className="flex w-full flex-col justify-center gap-2 mob:w-auto mob:flex-row">
				<Button asChild className="rounded-full">
					<Link href={HOME_PATH}>
						<Home className="size-4" aria-hidden="true" />
						На главную
					</Link>
				</Button>
				<Button variant="outline" className="rounded-full bg-card" onClick={handleBack}>
					<ArrowLeft className="size-4" aria-hidden="true" />
					Назад
				</Button>
			</div>
		</div>
	)
}
