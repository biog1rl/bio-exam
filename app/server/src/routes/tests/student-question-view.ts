export type StudentQuestionRow = {
	id: string
	type: string
	order: number
	points: number
	options: unknown
	matchingPairs: unknown
}

export type StudentQuestionTypeConfig = {
	uiTemplate: string
	title: string
}

export function studentQuestionView(
	row: StudentQuestionRow,
	typeConfig: StudentQuestionTypeConfig,
	promptText: string
) {
	return {
		id: row.id,
		type: row.type,
		questionUiTemplate: typeConfig.uiTemplate,
		questionTypeTitle: typeConfig.title,
		order: row.order,
		points: row.points,
		options: row.options,
		matchingPairs: row.matchingPairs,
		promptText,
	}
}
