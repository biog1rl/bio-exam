import assert from 'node:assert/strict'

import { appendQuestionTime, incrementQuestionFocusLoss, incrementQuestionVisit } from './telemetry'

const initial = {
	q1: {
		timeSpentMs: 1200,
		focusLossCount: 1,
		visitCount: 2,
	},
}

assert.deepEqual(appendQuestionTime(initial, 'q1', 800), {
	q1: {
		timeSpentMs: 2000,
		focusLossCount: 1,
		visitCount: 2,
	},
})

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

assert.deepEqual(incrementQuestionVisit(initial, 'q1'), {
	q1: {
		timeSpentMs: 1200,
		focusLossCount: 1,
		visitCount: 3,
	},
})

assert.deepEqual(incrementQuestionFocusLoss(initial, 'q1'), {
	q1: {
		timeSpentMs: 1200,
		focusLossCount: 2,
		visitCount: 2,
	},
})
