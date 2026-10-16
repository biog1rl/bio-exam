import type { ReviewStatus } from '@bio-exam/exam-core'

import { formatPoints } from './format'

export type AttemptResultFields = {
	reviewStatus: ReviewStatus
	earnedPoints: number | null
	totalPoints: number
	scorePercentage: number | null
	passed: boolean | null
	autoEarnedPoints: number
	autoTotalPoints: number
}

export type AttemptResultView =
	| { kind: 'pending'; auto: { earned: number; total: number } | null }
	| {
			kind: 'final'
			percent: number
			passed: boolean
			points: { earned: number; total: number }
			teacherChecked: boolean
	  }

export function attemptResultView(fields: AttemptResultFields): AttemptResultView {
	const { reviewStatus, earnedPoints, scorePercentage, passed } = fields
	if (reviewStatus === 'pending' || scorePercentage === null || passed === null || earnedPoints === null) {
		return {
			kind: 'pending',
			auto: fields.autoTotalPoints === 0 ? null : { earned: fields.autoEarnedPoints, total: fields.autoTotalPoints },
		}
	}
	return {
		kind: 'final',
		percent: scorePercentage,
		passed,
		points: { earned: earnedPoints, total: fields.totalPoints },
		teacherChecked: reviewStatus === 'graded',
	}
}

export type ReviewMarkKind = 'pending' | 'graded' | 'none'

export function reviewMarkOf(view: AttemptResultView): ReviewMarkKind {
	if (view.kind === 'pending') return 'pending'
	return view.teacherChecked ? 'graded' : 'none'
}

export function attemptPointsText(view: AttemptResultView): string | null {
	if (view.kind === 'pending') return view.auto ? formatPoints(view.auto) : null
	return formatPoints(view.points)
}

export function attemptVerdictText(view: AttemptResultView): string | null {
	if (view.kind === 'pending') return null
	return view.passed ? 'Пройден' : 'Не пройден'
}

export function attemptMetaLine(leading: readonly string[], view: AttemptResultView): string {
	return [...leading, attemptPointsText(view), attemptVerdictText(view)].filter(Boolean).join(' · ')
}
