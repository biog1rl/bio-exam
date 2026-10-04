import { ScoredQuestionFactSchema, type ScoredQuestionFact } from '@bio-exam/exam-core'

import type { ZodError } from 'zod'

export type StorableFactWarning = {
	questionId: string
	template: string
	dropped: string[]
	issues: string[]
}

function issuePaths(error: ZodError): string[] {
	return [...new Set(error.issues.map((issue) => issue.path.join('.')))]
}

function describeField(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

export function toStorableFact(
	candidate: Record<string, unknown>,
	warn: (info: StorableFactWarning) => void
): ScoredQuestionFact {
	const first = ScoredQuestionFactSchema.safeParse(candidate)
	if (first.success) return first.data

	const issues = issuePaths(first.error)
	const withoutVerdicts = { ...candidate, verdicts: null, mistakes: null }
	const second = ScoredQuestionFactSchema.safeParse(withoutVerdicts)
	if (second.success) {
		warn({
			questionId: describeField(candidate.questionId),
			template: describeField(candidate.template),
			dropped: ['verdicts', 'mistakes'],
			issues,
		})
		return second.data
	}

	const withoutKey = { ...withoutVerdicts, key: null, keyVersion: null }
	const third = ScoredQuestionFactSchema.safeParse(withoutKey)
	if (third.success) {
		warn({
			questionId: describeField(candidate.questionId),
			template: describeField(candidate.template),
			dropped: ['verdicts', 'mistakes', 'key', 'keyVersion'],
			issues: [...new Set([...issues, ...issuePaths(second.error)])],
		})
		return third.data
	}

	throw new Error(`scored fact failed schema: ${issuePaths(third.error).join(', ')}`)
}
