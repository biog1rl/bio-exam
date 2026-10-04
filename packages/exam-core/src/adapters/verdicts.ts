import { MISTAKES_UNSCORABLE, type ChoiceOptionVerdict, type QuestionContent, type QuestionVerdicts } from './types'

type VerdictParts = Pick<QuestionVerdicts, 'template' | 'parts'>

export function errorUnits(verdicts: VerdictParts): number {
	const kinds = verdicts.parts.map((part) => part.kind as string)
	const count = (kind: string) => kinds.filter((item) => item === kind).length
	if (verdicts.template === 'sequence_digits') {
		return count('wrong') + count('missing') + count('extra') + Math.ceil(count('swapped') / 2)
	}
	if (verdicts.template === 'single_choice' || verdicts.template === 'multi_choice') {
		return count('selected_wrong') + count('missed')
	}
	return count('wrong')
}

export function allPartsCorrect(verdicts: VerdictParts): boolean {
	if (verdicts.parts.length === 0) return false
	if (verdicts.template === 'single_choice' || verdicts.template === 'multi_choice') {
		return verdicts.parts.every((part) => part.kind === 'selected_correct' || part.kind === 'neutral')
	}
	return verdicts.parts.every((part) => part.kind === 'correct')
}

export function resolveMistakes(counted: number, verdicts: VerdictParts): number {
	return counted < MISTAKES_UNSCORABLE ? counted : errorUnits(verdicts)
}

export function choiceOptionVerdicts(
	selectedIds: readonly string[],
	keyIds: readonly string[] | null,
	content: QuestionContent
): ChoiceOptionVerdict[] {
	const order: string[] = []
	const seen = new Set<string>()
	for (const id of [...(content.options ?? []).map((option) => option.id), ...(keyIds ?? []), ...selectedIds]) {
		if (seen.has(id)) continue
		seen.add(id)
		order.push(id)
	}
	const selected = new Set(selectedIds)
	const correct = keyIds ? new Set(keyIds) : null
	return order.map((optionId) => {
		const isSelected = selected.has(optionId)
		if (!correct) return { optionId, kind: isSelected ? 'selected_wrong' : 'neutral' }
		if (correct.has(optionId)) return { optionId, kind: isSelected ? 'selected_correct' : 'missed' }
		return { optionId, kind: isSelected ? 'selected_wrong' : 'neutral' }
	})
}
