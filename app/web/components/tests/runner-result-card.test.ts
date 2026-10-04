import { questionStatus } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { runnerResultCard } from './runner-result-card'

test('runnerResultCard: correct даёт «Верно» и зелёную карточку', () => {
	assert.deepEqual(runnerResultCard('correct'), {
		label: 'Верно',
		className: 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm',
	})
})

test('runnerResultCard: partial даёт «Частично верно» и жёлтую карточку', () => {
	assert.deepEqual(runnerResultCard('partial'), {
		label: 'Частично верно',
		className: 'rounded border border-amber-200 bg-amber-50 p-3 text-sm',
	})
})

test('runnerResultCard: wrong даёт «Неверно» и красную карточку', () => {
	assert.deepEqual(runnerResultCard('wrong'), {
		label: 'Неверно',
		className: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm',
	})
})

test('runnerResultCard: ungraded даёт «Без оценки» и нейтральную карточку', () => {
	assert.deepEqual(runnerResultCard('ungraded'), {
		label: 'Без оценки',
		className: 'rounded border bg-muted/30 p-3 text-sm',
	})
})

test('SCORE-04-zero-points-status: вопрос с весом 0 подписан как в разборе: «Без оценки»', () => {
	for (const isCorrect of [true, false]) {
		assert.equal(runnerResultCard(questionStatus({ points: 0, isCorrect, earnedPoints: 0 })).label, 'Без оценки')
	}
})
