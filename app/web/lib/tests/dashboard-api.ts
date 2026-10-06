import type { ActivityDay } from '@/lib/charts/dashboard-series'
import { MalformedBodyError } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import { isRecord } from '@/lib/utils/is-record'

import type { AttemptResultFields } from './attempt-result-view'

export type AdminDashboardAttempt = AttemptResultFields & {
	attemptId: string
	testId: string
	testTitle: string
	testSlug: string
	topicSlug: string
	topicTitle: string
	studentId: string
	studentName: string
	submittedAt: string
}

export type AdminDashboard = {
	summary: {
		totalAttempts: number
		activeStudents: number
		averageScore: number | null
		passedAttempts: number
	}
	latestAttempts: AdminDashboardAttempt[]
	dailyActivity: ActivityDay[]
}

export function adminDashboardKey(): string {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
	return `/api/tests/admin/dashboard?tz=${encodeURIComponent(timeZone)}`
}

function parseAdminDashboard(body: unknown): AdminDashboard {
	if (!isRecord(body) || !isRecord(body.summary) || !Array.isArray(body.latestAttempts)) {
		throw new MalformedBodyError()
	}
	if (!Array.isArray(body.dailyActivity)) throw new MalformedBodyError()
	return {
		summary: body.summary as AdminDashboard['summary'],
		latestAttempts: body.latestAttempts as AdminDashboardAttempt[],
		dailyActivity: body.dailyActivity.filter(isRecord).map((day) => ({
			date: String(day.date ?? ''),
			attempts: Number(day.attempts ?? 0),
			averageScore: day.averageScore == null ? null : Number(day.averageScore),
		})),
	}
}

export const adminDashboardFetcher = fetcherWith(parseAdminDashboard)
