import { isAnswered } from '@bio-exam/exam-core'

import type { PublicTestQuestion } from '@/lib/tests/types'

type AnswerableQuestion = Pick<PublicTestQuestion, 'questionUiTemplate' | 'options' | 'matchingPairs' | 'allowPhotos'>

export function isQuestionAnswered(input: {
	question: AnswerableQuestion
	answer: unknown
	photoCount: number
}): boolean {
	const { question, answer, photoCount } = input
	if (question.questionUiTemplate === 'open' && question.allowPhotos && photoCount > 0) return true
	return isAnswered({
		template: question.questionUiTemplate,
		answer,
		content: { options: question.options, matchingPairs: question.matchingPairs },
	})
}
