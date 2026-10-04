import { z } from 'zod'

import { normalizeDigitsSequence } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type TemplateAdapter } from './types'

export const sequenceDigitsAdapter: TemplateAdapter<string> = {
	template: 'sequence_digits',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.sequence_digits,
	answerSchema: z.string(),
	normalizeAnswer: normalizeDigitsSequence,
	countMistakes(_metric, userAnswer, correctAnswer) {
		const userSequence = sequenceDigitsAdapter.normalizeAnswer(userAnswer)
		const correctSequence = normalizeDigitsSequence(correctAnswer)
		if (!userSequence || !correctSequence) return MISTAKES_UNSCORABLE

		const minLength = Math.min(userSequence.length, correctSequence.length)
		let mistakes = Math.abs(userSequence.length - correctSequence.length)
		const mismatchedIndexes: number[] = []
		for (let i = 0; i < minLength; i++) {
			if (userSequence[i] !== correctSequence[i]) {
				mistakes += 1
				mismatchedIndexes.push(i)
			}
		}

		if (
			correctSequence.length > 3 &&
			userSequence.length === correctSequence.length &&
			mismatchedIndexes.length === 2
		) {
			const [firstIndex, secondIndex] = mismatchedIndexes
			const isSingleAdjacentSwap =
				secondIndex === firstIndex + 1 &&
				userSequence[firstIndex] === correctSequence[secondIndex] &&
				userSequence[secondIndex] === correctSequence[firstIndex]
			if (isSingleAdjacentSwap) return 1
		}

		return mistakes
	},
}
