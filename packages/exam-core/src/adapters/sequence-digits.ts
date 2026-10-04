import { z } from 'zod'

import { AUTHORING_MESSAGES } from '../authoring-messages'
import { normalizeCompactString, normalizeDigitsSequence, normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { MISTAKES_UNSCORABLE, type SequencePositionVerdict, type TemplateAdapter } from './types'
import { resolveMistakes } from './verdicts'

function findAdjacentSwap(user: string, correct: string): [number, number] | null {
	if (correct.length <= 3 || user.length !== correct.length) return null
	const mismatched: number[] = []
	for (let i = 0; i < correct.length; i++) {
		if (user[i] !== correct[i]) mismatched.push(i)
	}
	if (mismatched.length !== 2) return null
	const [first, second] = mismatched
	const isSwap = second === first + 1 && user[first] === correct[second] && user[second] === correct[first]
	return isSwap ? [first, second] : null
}

function sequencePositionVerdicts(user: string, correct: string): SequencePositionVerdict[] {
	const swap = findAdjacentSwap(user, correct)
	const length = Math.max(user.length, correct.length)
	const parts: SequencePositionVerdict[] = []
	for (let i = 0; i < length; i++) {
		const given = i < user.length ? user[i] : null
		const expected = i < correct.length ? correct[i] : null
		const kind: SequencePositionVerdict['kind'] =
			swap && (i === swap[0] || i === swap[1])
				? 'swapped'
				: given == null
					? 'missing'
					: expected == null
						? 'extra'
						: given === expected
							? 'correct'
							: 'wrong'
		parts.push({ position: i + 1, kind, given, expected })
	}
	return parts
}

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
	verdicts({ metric, key, answer }) {
		const correct = normalizeDigitsSequence(key)
		const user = normalizeDigitsSequence(answer) ?? normalizeCompactString(answer) ?? ''
		const parts = correct ? sequencePositionVerdicts(user, correct) : []
		const verdicts = { template: 'sequence_digits' as const, parts }
		return {
			...verdicts,
			mistakes: resolveMistakes(sequenceDigitsAdapter.countMistakes(metric, answer, key), verdicts),
		}
	},
	isAnswered(answer) {
		return typeof answer === 'string' && answer.trim().length > 0
	},
	readKey(raw, metric) {
		if (metric !== 'hamming_digits') return null
		return normalizeIdValue(raw)
	},
	validateAuthoring({ key }) {
		if (typeof key !== 'string' || !/^\d+$/.test(key.replace(/\s+/g, ''))) return AUTHORING_MESSAGES.sequenceDigitsOnly
		return null
	},
	keyShape() {
		return 'digits'
	},
}
