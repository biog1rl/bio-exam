'use client'

import { useMemo, useState } from 'react'

import { Loader2, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api-fetch'
import type { UserRow } from '@/types/users'

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

type TestAssignment = {
	testId: string
	testTitle: string
	testSlug: string
	assignedAt: string
}

type TestItem = {
	id: string
	title: string
	topicTitle: string | null
}

type UserAttempt = {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

type Props = {
	login: string
}

export default function UserProfileAssignmentsPage({ login }: Props) {
	const normalizedLogin = login.trim().toLowerCase()

	const { data: usersData, isLoading: usersLoading } = useSWR<{ users: UserRow[] }>('/api/users', fetcher)

	const user = useMemo(
		() =>
			usersData?.users?.find((u) => typeof u.login === 'string' && u.login.toLowerCase() === normalizedLogin) ?? null,
		[usersData, normalizedLogin]
	)

	const userId = user?.id ?? null

	const {
		data: assignmentsData,
		isLoading: assignmentsLoading,
		mutate: mutateAssignments,
	} = useSWR<{ assignments: TestAssignment[] }>(userId ? `/api/users/${userId}/test-assignments` : null, fetcher)
	const { data: attemptsData, isLoading: attemptsLoading } = useSWR<{ attempts: UserAttempt[] }>(
		userId ? `/api/users/${userId}/test-attempts` : null,
		fetcher
	)

	const { data: testsData, isLoading: testsLoading } = useSWR<{ tests: TestItem[] }>('/api/tests', fetcher)

	const [assigningTestId, setAssigningTestId] = useState<string | null>(null)
	const [removingTestId, setRemovingTestId] = useState<string | null>(null)

	const assignments = useMemo(() => assignmentsData?.assignments ?? [], [assignmentsData])
	const attempts = useMemo(() => attemptsData?.attempts ?? [], [attemptsData])
	const assignedTestIds = useMemo(() => new Set(assignments.map((a) => a.testId)), [assignments])

	const availableTests = useMemo(
		() => (testsData?.tests ?? []).filter((t) => !assignedTestIds.has(t.id)),
		[testsData, assignedTestIds]
	)

	const handleAssign = async (testId: string) => {
		if (!userId || assigningTestId) return
		setAssigningTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ testId }),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка назначения теста')
			}
			await mutateAssignments()
			toast.success('Тест назначен')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка назначения теста')
		} finally {
			setAssigningTestId(null)
		}
	}

	const handleRemove = async (testId: string) => {
		if (!userId || removingTestId) return
		setRemovingTestId(testId)
		try {
			const res = await apiFetch(`/api/users/${userId}/test-assignments/${testId}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error || 'Ошибка удаления назначения')
			}
			await mutateAssignments()
			toast.success('Назначение удалено')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка удаления назначения')
		} finally {
			setRemovingTestId(null)
		}
	}

	if (usersLoading || (Boolean(userId) && (assignmentsLoading || attemptsLoading))) {
		return (
			<div className="flex items-center justify-center p-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (!user) {
		return <div className="text-muted-foreground p-8 text-center">Пользователь не найден</div>
	}

	const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.login

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">{displayName}</h1>
				<p className="text-muted-foreground">{user.login}</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Пройденные тесты</CardTitle>
				</CardHeader>
				<CardContent>
					{attempts.length === 0 ? (
						<p className="text-muted-foreground text-sm">Отправленных попыток пока нет</p>
					) : (
						<div className="space-y-2">
							{attempts.map((attempt) => (
								<Link
									href={`/admin/attempts/${attempt.attemptId}`}
									key={attempt.attemptId}
									className="hover:bg-secondary flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition hover:border-black/40"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{attempt.testTitle}</p>
										<p className="text-muted-foreground text-xs">
											{new Date(attempt.submittedAt).toLocaleString('ru-RU')} · {attempt.earnedPoints}/
											{attempt.totalPoints} · {attempt.scorePercentage}%
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant={attempt.passed ? 'default' : 'secondary'}>
											{attempt.passed ? 'Пройден' : 'Не пройден'}
										</Badge>
									</div>
								</Link>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Назначенные тесты</CardTitle>
					</CardHeader>
					<CardContent>
						{assignments.length === 0 ? (
							<p className="text-muted-foreground text-sm">Нет назначенных тестов</p>
						) : (
							<div className="space-y-2">
								{assignments.map((a) => (
									<div key={a.testId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{a.testTitle}</p>
											<p className="text-muted-foreground text-xs">
												{new Date(a.assignedAt).toLocaleDateString('ru-RU')}
											</p>
										</div>
										<Button
											size="icon"
											variant="ghost"
											aria-label="Удалить назначение"
											onClick={() => handleRemove(a.testId)}
											disabled={removingTestId === a.testId}
										>
											{removingTestId === a.testId ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Trash2 className="h-4 w-4" />
											)}
										</Button>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Назначить тест</CardTitle>
					</CardHeader>
					<CardContent>
						{testsLoading ? (
							<div className="text-muted-foreground flex items-center gap-2 text-sm">
								<Loader2 className="h-4 w-4 animate-spin" />
								Загрузка тестов...
							</div>
						) : availableTests.length === 0 ? (
							<p className="text-muted-foreground text-sm">Все тесты уже назначены</p>
						) : (
							<div className="max-h-80 space-y-2 overflow-y-auto">
								{availableTests.map((t) => (
									<div key={t.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{t.title}</p>
											{t.topicTitle && (
												<Badge variant="secondary" className="mt-0.5 text-xs">
													{t.topicTitle}
												</Badge>
											)}
										</div>
										<Button
											size="sm"
											variant="outline"
											onClick={() => handleAssign(t.id)}
											disabled={assigningTestId === t.id}
										>
											{assigningTestId === t.id ? (
												<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											) : (
												<UserPlus className="mr-1 h-3 w-3" />
											)}
											Назначить
										</Button>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
