import { questionStatus, type QuestionStatus } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { runnerResultCard } from './runner-result-card'

test('SCORE-04-zero-points-status: вопрос с весом 0 подписан как в разборе: «Без оценки»', () => {
	for (const isCorrect of [true, false]) {
		assert.equal(runnerResultCard(questionStatus({ points: 0, isCorrect, earnedPoints: 0 })).label, 'Без оценки')
	}
})

test('runnerResultCard: статус отсутствует, карточка «Без оценки»', () => {
	assert.deepEqual(runnerResultCard(undefined), {
		label: 'Без оценки',
		className: 'rounded border bg-muted/30 p-3 text-sm',
	})
})

test('runnerResultCard: неизвестный статус даёт «Без оценки»', () => {
	assert.deepEqual(runnerResultCard('skipped' as unknown as QuestionStatus), {
		label: 'Без оценки',
		className: 'rounded border bg-muted/30 p-3 text-sm',
	})
})

test('runnerResultCard: открытый вопрос подписан «На проверке» нейтральными классами', () => {
	assert.deepEqual(
		runnerResultCard(questionStatus({ points: 3, isCorrect: false, earnedPoints: 0, template: 'open' })),
		{
			label: 'На проверке',
			className: 'rounded border border-border/70 bg-secondary p-3 text-sm text-secondary-foreground',
		}
	)
})
