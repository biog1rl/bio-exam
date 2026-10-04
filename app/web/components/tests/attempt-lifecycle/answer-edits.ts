import type { AnswerValue } from '@bio-exam/exam-core'

export function toggleOption(current: AnswerValue | undefined, optionId: string): string[] {
	const selected = Array.isArray(current) ? current : []
	return selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]
}

export function setMatchingPair(
	current: AnswerValue | undefined,
	leftId: string,
	rightId: string
): Record<string, string> {
	const pairs = typeof current === 'object' && current !== null && !Array.isArray(current) ? current : {}
	return { ...pairs, [leftId]: rightId }
}
