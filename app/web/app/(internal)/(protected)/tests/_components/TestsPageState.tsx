import { AlertCircle, BookOpenCheck } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'

export function TestsPageLoading() {
	return (
		<main className="space-y-5">
			<Skeleton className="h-86 rounded-4xl" />
			<Skeleton className="h-40 rounded-4xl" />
			<div className="grid gap-3 tab-sm:grid-cols-2">
				<Skeleton className="h-48 rounded-3xl" />
				<Skeleton className="h-48 rounded-3xl" />
			</div>
		</main>
	)
}

export function TestsPageError() {
	return (
		<main className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
			<AlertCircle className="size-7 text-destructive" />
			<h1 className="mt-5 font-serif text-3xl">Не удалось загрузить тесты</h1>
			<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
				Обновите страницу или вернитесь позже. Каталог зависит от доступности сервера тестов.
			</p>
		</main>
	)
}

export function TestsPageEmpty() {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
			<BookOpenCheck className="size-7 text-primary" />
			<h2 className="mt-5 font-serif text-3xl">Опубликованных тестов пока нет</h2>
			<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
				Когда преподаватель опубликует первый материал, он появится в этом каталоге.
			</p>
		</section>
	)
}
