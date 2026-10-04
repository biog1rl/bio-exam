import {
	normalizeKeyValue,
	scoreQuestionFacts,
	type LegacyAttemptResultItem,
	type QuestionContent,
	type RuntimeQuestionTypeConfig,
} from '@bio-exam/exam-core'

import type { ReadableFact } from './view.js'

export type LegacyQuestion = {
	typeConfig: RuntimeQuestionTypeConfig
	content: QuestionContent
	points: number
}

export function legacyFact(params: {
	item: LegacyAttemptResultItem
	question: LegacyQuestion | null
	historyKey: unknown
}): ReadableFact {
	const { item, question, historyKey } = params
	const base = {
		questionId: item.questionId,
		points: item.points,
		earnedPoints: item.earnedPoints,
		isCorrect: item.isCorrect,
		userAnswer: item.userAnswer ?? null,
		explanationText: item.explanationText ?? null,
	}
	const rawKey = item.correctAnswer != null ? item.correctAnswer : (historyKey ?? null)
	if (rawKey == null) return { ...base, key: null, verdicts: null, mistakes: null }
	if (!question) return { ...base, key: normalizeKeyValue(rawKey), verdicts: null, mistakes: null }
	const scored = scoreQuestionFacts({
		typeConfig: question.typeConfig,
		rawKey,
		userAnswer: item.userAnswer ?? null,
		fallbackMaxPoints: question.points,
		content: question.content,
	})
	const key = scored.key ?? normalizeKeyValue(rawKey)
	const matches = scored.isCorrect === item.isCorrect && scored.earnedPoints === item.earnedPoints
	if (!matches) return { ...base, key, verdicts: null, mistakes: null }
	return { ...base, key, verdicts: scored.verdicts, mistakes: scored.mistakes }
}
