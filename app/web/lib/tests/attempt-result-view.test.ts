import { describe, expect, it } from 'vitest'

import { attemptResultView, type AttemptResultFields } from './attempt-result-view'

const base: AttemptResultFields = {
	reviewStatus: 'none',
	earnedPoints: 4,
	totalPoints: 5,
	scorePercentage: 80,
	passed: true,
	autoEarnedPoints: 4,
	autoTotalPoints: 5,
}

const rows: { name: string; fields: AttemptResultFields; view: ReturnType<typeof attemptResultView> }[] = [
	{
		name: 'none: итог без отметки',
		fields: base,
		view: { kind: 'final', percent: 80, passed: true, points: { earned: 4, total: 5 }, teacherChecked: false },
	},
	{
		name: 'graded: итог с отметкой учителя',
		fields: { ...base, reviewStatus: 'graded', earnedPoints: 7, totalPoints: 8, scorePercentage: 87.5 },
		view: { kind: 'final', percent: 87.5, passed: true, points: { earned: 7, total: 8 }, teacherChecked: true },
	},
	{
		name: 'pending: автобаллы без процента',
		fields: {
			reviewStatus: 'pending',
			earnedPoints: null,
			totalPoints: 8,
			scorePercentage: null,
			passed: null,
			autoEarnedPoints: 3,
			autoTotalPoints: 5,
		},
		view: { kind: 'pending', auto: { earned: 3, total: 5 } },
	},
	{
		name: 'pending: в тесте только открытые вопросы',
		fields: {
			reviewStatus: 'pending',
			earnedPoints: null,
			totalPoints: 3,
			scorePercentage: null,
			passed: null,
			autoEarnedPoints: 0,
			autoTotalPoints: 0,
		},
		view: { kind: 'pending', auto: null },
	},
	{
		name: 'none с null в проценте: защитная ветка даёт pending',
		fields: { ...base, scorePercentage: null },
		view: { kind: 'pending', auto: { earned: 4, total: 5 } },
	},
	{
		name: 'none с нулевым весом: процент 0',
		fields: { ...base, earnedPoints: 0, totalPoints: 0, scorePercentage: 0, passed: false },
		view: { kind: 'final', percent: 0, passed: false, points: { earned: 0, total: 0 }, teacherChecked: false },
	},
]

describe('attemptResultView', () => {
	it.each(rows.map((row) => [row.name, row] as const))('%s', (_name, row) => {
		expect(attemptResultView(row.fields)).toEqual(row.view)
	})
})
