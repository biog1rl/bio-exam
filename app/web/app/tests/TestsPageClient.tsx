'use client'

import Link from 'next/link'
import useSWR from 'swr'

import { fetchPublicTestsList } from '@/lib/tests/api'
import type { PublicTestListItem } from '@/lib/tests/types'

const fetcher = async () => fetchPublicTestsList()

export default function TestsPageClient() {
	const { data, isLoading, error } = useSWR('public-tests-list', fetcher)

	if (isLoading) {
		return <div className="p-6">Загрузка тестов...</div>
	}

	if (error) {
		return <div className="p-6 text-red-600">Не удалось загрузить список тестов</div>
	}

	const tests = data?.tests ?? []
	const grouped = tests.reduce<Record<string, { topicTitle: string; tests: PublicTestListItem[] }>>((acc, item) => {
		if (!acc[item.topicId]) {
			acc[item.topicId] = { topicTitle: item.topicTitle, tests: [] }
		}
		acc[item.topicId].tests.push(item)
		return acc
	}, {})

	const groups = Object.values(grouped)

	return (
		<main className="space-y-6 p-6">
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold">Тесты</h1>
				<p className="text-muted-foreground">Список опубликованных тестов из базы данных</p>
			</header>

			{groups.length === 0 ? (
				<div className="rounded-lg border p-6">Опубликованных тестов пока нет</div>
			) : (
				groups.map((group) => (
					<section key={group.topicTitle} className="bg-secondary space-y-3 rounded-lg border p-4">
						<h2 className="text-xl font-semibold">{group.topicTitle}</h2>
						<ul className="space-y-3">
							{group.tests.map((test) => (
								<li key={test.id}>
									<Link
										href={`/tests/${test.topicSlug}/${test.slug}`}
										className="hover:bg-background/60 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:border-black/40"
									>
										<div className="space-y-1">
											<span className="text-base font-medium underline-offset-2 hover:underline">{test.title}</span>
											{test.description ? <p className="text-muted-foreground text-sm">{test.description}</p> : null}
											<p className="text-muted-foreground text-xs">
												Вопросов: {test.questionsCount}
												{test.timeLimitMinutes ? ` / Лимит: ${test.timeLimitMinutes} мин` : ''}
												{test.passingScore != null ? ` / Проходной: ${test.passingScore}%` : ''}
											</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))
			)}
		</main>
	)
}
