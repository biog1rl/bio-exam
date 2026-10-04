import { z } from 'zod'

import { AUTHORING_MESSAGES } from '../authoring-messages'
import { normalizeIdRecord, normalizeIdValue } from '../normalize'
import { ALLOWED_MISTAKE_METRICS_BY_TEMPLATE } from '../registry'
import { hasEmptyText, readMatchingSides, uniqueStringIds } from './authoring-rules'
import { MISTAKES_UNSCORABLE, type MatchingPairVerdict, type TemplateAdapter } from './types'
import { resolveMistakes } from './verdicts'

function readGivenPairs(answer: unknown): Record<string, string> {
	if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return {}
	const given: Record<string, string> = {}
	for (const [leftId, raw] of Object.entries(answer)) {
		const value = normalizeIdValue(raw)
		if (value != null) given[leftId] = value
	}
	return given
}

export const matchingAdapter: TemplateAdapter<Record<string, string>> = {
	template: 'matching',
	metrics: ALLOWED_MISTAKE_METRICS_BY_TEMPLATE.matching,
	answerSchema: z.record(z.string(), z.string()),
	normalizeAnswer: normalizeIdRecord,
	countMistakes(_metric, userAnswer, correctAnswer) {
		const normalizedUser = matchingAdapter.normalizeAnswer(userAnswer)
		const normalizedCorrect = normalizeIdRecord(correctAnswer)
		if (!normalizedUser || !normalizedCorrect) return MISTAKES_UNSCORABLE

		const correctKeys = Object.keys(normalizedCorrect)
		if (correctKeys.length === 0) return MISTAKES_UNSCORABLE

		let mistakes = 0
		for (const leftId of correctKeys) {
			if (normalizedUser[leftId] !== normalizedCorrect[leftId]) mistakes += 1
		}

		return mistakes
	},
	verdicts({ metric, key, answer, content }) {
		const readKey = matchingAdapter.readKey(key, metric)
		const correct =
			readKey && typeof readKey === 'object' && !Array.isArray(readKey) && Object.keys(readKey).length > 0
				? readKey
				: null
		const user = matchingAdapter.normalizeAnswer(answer)
		const given = readGivenPairs(answer)
		const contentLeftIds = (content.matchingPairs?.left ?? []).map((left) => left.id)
		const leftIds = correct
			? [
					...contentLeftIds.filter((leftId) => Object.hasOwn(correct, leftId)),
					...Object.keys(correct).filter((leftId) => !contentLeftIds.includes(leftId)),
				]
			: contentLeftIds
		const parts: MatchingPairVerdict[] = leftIds.map((leftId) => {
			const expected = correct ? correct[leftId] : null
			const isCorrect = correct != null && user != null && user[leftId] === expected
			return { leftId, kind: isCorrect ? 'correct' : 'wrong', given: given[leftId] ?? null, expected }
		})
		const verdicts = { template: 'matching' as const, parts }
		return {
			...verdicts,
			mistakes: resolveMistakes(matchingAdapter.countMistakes(metric, answer, key), verdicts),
		}
	},
	isAnswered(answer, content) {
		if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !content.matchingPairs) return false
		const pairs = answer as Record<string, unknown>
		return content.matchingPairs.left.every((left) => {
			const value = pairs[left.id]
			return typeof value === 'string' && value.length > 0
		})
	},
	readKey(raw, metric) {
		if (metric !== 'pair_mismatch_count') return null
		return normalizeIdRecord(raw)
	},
	validateAuthoring({ content, key }) {
		const sides = readMatchingSides(content.matchingPairs)
		if (!sides || sides.left.length < 2 || sides.right.length < 2) return AUTHORING_MESSAGES.matchingTooFew
		if (hasEmptyText(sides.left) || hasEmptyText(sides.right)) return AUTHORING_MESSAGES.matchingItemEmpty
		const leftIds = uniqueStringIds(sides.left)
		const rightIds = uniqueStringIds(sides.right)
		if (!leftIds || !rightIds) return AUTHORING_MESSAGES.matchingIdsInvalid
		if (!key || typeof key !== 'object' || Array.isArray(key)) return AUTHORING_MESSAGES.matchingKeyMissing
		const pairsKey = key as Record<string, unknown>
		if (Object.values(pairsKey).some((value) => typeof value !== 'string')) return AUTHORING_MESSAGES.matchingKeyMissing
		for (const leftId of leftIds) {
			const mapped = Object.hasOwn(pairsKey, leftId) ? pairsKey[leftId] : undefined
			if (typeof mapped !== 'string' || !rightIds.includes(mapped)) return AUTHORING_MESSAGES.matchingKeyMissing
		}
		return null
	},
	keyShape() {
		return 'pairs'
	},
}
