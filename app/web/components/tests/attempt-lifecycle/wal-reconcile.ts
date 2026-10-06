import type { AnswerValue } from '@bio-exam/exam-core'

export type UnsentEntry = { questionId: string; number: number; text: string }

export type UnsentRecord = {
	v: 1
	testId: string
	attemptId: string | null
	certain: boolean
	entries: UnsentEntry[]
}

export type UnsentTextsInput = {
	local: Readonly<Record<string, AnswerValue>>
	stored: readonly { questionId: string; userAnswer?: unknown }[] | null
	textQuestionIds: ReadonlySet<string>
	questionOrder: readonly string[]
	pending: ReadonlySet<string>
}

function storedText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : ''
}

export function unsentTexts({
	local,
	stored,
	textQuestionIds,
	questionOrder,
	pending,
}: UnsentTextsInput): UnsentEntry[] {
	const storedByQuestion = new Map((stored ?? []).map((item) => [item.questionId, item.userAnswer]))
	const entries: UnsentEntry[] = []
	questionOrder.forEach((questionId, index) => {
		if (!textQuestionIds.has(questionId)) return
		const value = local[questionId]
		if (typeof value !== 'string' || value.trim().length === 0) return
		const differs =
			stored === null ? pending.has(questionId) : storedText(storedByQuestion.get(questionId)) !== value.trim()
		if (differs) entries.push({ questionId, number: index + 1, text: value })
	})
	return entries
}
