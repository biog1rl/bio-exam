import assert from 'node:assert/strict'
import { test } from 'vitest'

import { appendQuestionTime, incrementQuestionFocusLoss, incrementQuestionVisit, mergeTelemetryMaps } from './telemetry'

const initial = {
	q1: {
		timeSpentMs: 1200,
		focusLossCount: 1,
		visitCount: 2,
	},
}

test('appendQuestionTime: добавляет время к существующему вопросу', () => {
	assert.deepEqual(appendQuestionTime(initial, 'q1', 800), {
		q1: {
			timeSpentMs: 2000,
			focusLossCount: 1,
			visitCount: 2,
		},
	})
})

test('appendQuestionTime: создаёт запись для нового вопроса', () => {
	assert.deepEqual(appendQuestionTime(initial, 'q2', 500), {
		q1: {
			timeSpentMs: 1200,
			focusLossCount: 1,
			visitCount: 2,
		},
		q2: {
			timeSpentMs: 500,
			focusLossCount: 0,
			visitCount: 0,
		},
	})
})

test('incrementQuestionVisit: увеличивает счётчик посещений', () => {
	assert.deepEqual(incrementQuestionVisit(initial, 'q1'), {
		q1: {
			timeSpentMs: 1200,
			focusLossCount: 1,
			visitCount: 3,
		},
	})
})

test('incrementQuestionFocusLoss: увеличивает счётчик потерь фокуса', () => {
	assert.deepEqual(incrementQuestionFocusLoss(initial, 'q1'), {
		q1: {
			timeSpentMs: 1200,
			focusLossCount: 2,
			visitCount: 2,
		},
	})
})

test('mergeTelemetryMaps: берёт максимумы по вопросам и добавляет новые вопросы', () => {
	assert.deepEqual(
		mergeTelemetryMaps(
			{
				q1: { timeSpentMs: 5000, focusLossCount: 1, visitCount: 2 },
			},
			{
				q1: { timeSpentMs: 7000, focusLossCount: 0, visitCount: 3 },
				q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
			}
		),
		{
			q1: { timeSpentMs: 7000, focusLossCount: 1, visitCount: 3 },
			q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
		}
	)
})
