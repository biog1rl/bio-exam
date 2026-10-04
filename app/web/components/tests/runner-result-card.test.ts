import assert from 'node:assert/strict'
import { test } from 'vitest'

import { getQuestionStatus, getStatusLabel } from './attempt-review/attempt-review-utils'
import { runnerResultCard } from './runner-result-card'

const KNOWN_DEFECTS = new Set<string>(['SCORE-04-zero-points-status'])

function defectTest(id: string, title: string, fn: () => void): void {
	const name = `${id}: ${title}`
	if (KNOWN_DEFECTS.has(id)) test.fails(name, fn)
	else test(name, fn)
}

test('runnerResultCard: верный ответ даёт «Верно» и зелёную карточку', () => {
	assert.deepEqual(runnerResultCard({ isCorrect: true, earnedPoints: 1, points: 1 }), {
		label: 'Верно',
		className: 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm',
	})
})

test('runnerResultCard: неполный балл даёт «Частично верно» и жёлтую карточку', () => {
	assert.deepEqual(runnerResultCard({ isCorrect: false, earnedPoints: 1, points: 2 }), {
		label: 'Частично верно',
		className: 'rounded border border-amber-200 bg-amber-50 p-3 text-sm',
	})
})

test('runnerResultCard: ноль баллов при ненулевом весе даёт «Неверно» и красную карточку', () => {
	assert.deepEqual(runnerResultCard({ isCorrect: false, earnedPoints: 0, points: 1 }), {
		label: 'Неверно',
		className: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm',
	})
})

defectTest('SCORE-04-zero-points-status', 'вопрос с весом 0 подписан как в разборе: «Без оценки»', () => {
	for (const result of [
		{ points: 0, isCorrect: true, earnedPoints: 0 },
		{ points: 0, isCorrect: false, earnedPoints: 0 },
	]) {
		const reviewLabel = getStatusLabel(getQuestionStatus('q', [{ questionId: 'q', ...result }]))
		assert.equal(reviewLabel, 'Без оценки')
		assert.equal(runnerResultCard(result).label, reviewLabel)
	}
})
