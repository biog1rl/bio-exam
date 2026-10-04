import { stableSerialize } from '@/lib/drafts/question-draft-copy'

import type { Question } from '../../../types'
import { normalizeQuestionForSave } from '../../../types'

export function questionFormKey(question: Question): string {
	return stableSerialize({ ...normalizeQuestionForSave(question), id: undefined })
}

export function toQuestionDraftPayload(question: Question, order: number): { question: Question } {
	return { question: { ...normalizeQuestionForSave(question), id: undefined, order } }
}
