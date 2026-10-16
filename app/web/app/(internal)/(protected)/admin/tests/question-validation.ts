import { ANSWER_PHOTO_MAX_COUNT_LIMIT, toCanonicalKey, validateQuestionForSave } from '@bio-exam/exam-core'
import type { TemplateConfig } from '@bio-exam/exam-core'

import { isValidMaxPhotos, type Question, type QuestionTypeDefinition } from './types'

function resolveTemplateConfig(question: Question, questionTypes: QuestionTypeDefinition[]): TemplateConfig | null {
	const questionType = questionTypes.find((item) => item.key === question.type)
	if (!questionType) return null
	const uiTemplate = question.questionUiTemplate ?? questionType.uiTemplate
	if (!uiTemplate) return null
	return {
		uiTemplate,
		mistakeMetric: questionType.scoringRule.mistakeMetric,
		validationSchema: questionType.validationSchema ?? null,
	}
}

export function validateQuestion(
	question: Question,
	questionTypes: QuestionTypeDefinition[] | undefined
): string | null {
	if (questionTypes === undefined) return null
	const config = resolveTemplateConfig(question, questionTypes)
	if (config?.uiTemplate === 'open' && question.allowPhotos && !isValidMaxPhotos(question.maxPhotos)) {
		return `Максимум фото: целое число от 1 до ${ANSWER_PHOTO_MAX_COUNT_LIMIT}`
	}
	const key = config ? toCanonicalKey({ uiTemplate: config.uiTemplate, key: question.correct }) : question.correct
	return validateQuestionForSave({
		config,
		promptText: question.promptText,
		content: { options: question.options, matchingPairs: question.matchingPairs },
		key,
	})
}
