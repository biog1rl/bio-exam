import {
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	createDefaultScoringRuleForTemplate,
	isMistakeMetricAllowedForTemplate,
	validateQuestionForSave,
	type QuestionContent,
	type QuestionTypeDefinition,
	type QuestionTypeScoringRule,
	type QuestionUiTemplate,
} from '@bio-exam/exam-core'

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { testQuestionTypeOverrides } from '../../db/schema.js'

type ValidationSchema = NonNullable<z.infer<typeof QuestionTypeValidationSchema>>

export type RuntimeQuestionType = {
	key: string
	title: string
	description: string | null
	uiTemplate: QuestionUiTemplate
	validationSchema: ValidationSchema | null
	scoringRule: QuestionTypeScoringRule
	isSystem: boolean
	isActive: boolean
}

export type RuntimeQuestionTypesMap = Record<string, RuntimeQuestionType>

type RuntimeQuestionTypeOverride = {
	questionTypeKey: string
	titleOverride: string | null
	scoringRuleOverride: QuestionTypeScoringRule | null
	isDisabled: boolean
}

function parseValidationSchema(value: unknown): ValidationSchema | null {
	if (value == null) return null
	const parsed = QuestionTypeValidationSchema.safeParse(value)
	if (!parsed.success) return null
	return parsed.data ?? null
}

function parseScoringRule(value: unknown, template: QuestionUiTemplate): QuestionTypeScoringRule {
	const parsed = QuestionTypeScoringRuleSchema.safeParse(value)
	if (parsed.success && isMistakeMetricAllowedForTemplate(template, parsed.data.mistakeMetric)) {
		return parsed.data
	}
	return createDefaultScoringRuleForTemplate(template)
}

function toRuntimeFromDb(row: {
	key: string
	title: string
	description: string | null
	uiTemplate: QuestionUiTemplate
	validationSchema: unknown
	scoringRule: unknown
	isSystem: boolean
	isActive: boolean
}): RuntimeQuestionType {
	return {
		key: row.key,
		title: row.title,
		description: row.description,
		uiTemplate: row.uiTemplate,
		validationSchema: parseValidationSchema(row.validationSchema),
		scoringRule: parseScoringRule(row.scoringRule, row.uiTemplate),
		isSystem: row.isSystem,
		isActive: row.isActive,
	}
}

function applyOverride(
	base: RuntimeQuestionType,
	override: RuntimeQuestionTypeOverride | undefined
): RuntimeQuestionType {
	if (!override) return base
	return {
		...base,
		title: override.titleOverride?.trim() ? override.titleOverride.trim() : base.title,
		scoringRule: override.scoringRuleOverride ?? base.scoringRule,
		isActive: override.isDisabled ? false : base.isActive,
	}
}

export async function getGlobalQuestionTypes(params?: { includeInactive?: boolean }): Promise<RuntimeQuestionType[]> {
	const includeInactive = params?.includeInactive === true
	const rows = await db.query.questionTypes.findMany()
	const merged = rows.map(toRuntimeFromDb).sort((a, b) => {
		if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
		return a.title.localeCompare(b.title, 'ru')
	})
	return includeInactive ? merged : merged.filter((item) => item.isActive)
}

export async function getEffectiveQuestionTypesForTest(params: {
	testId: string
	includeInactive?: boolean
}): Promise<RuntimeQuestionType[]> {
	const globalTypes = await getGlobalQuestionTypes({ includeInactive: true })
	const overrides = await db.query.testQuestionTypeOverrides.findMany({
		where: eq(testQuestionTypeOverrides.testId, params.testId),
	})

	const overridesMap = new Map<string, RuntimeQuestionTypeOverride>(
		overrides.map((item) => [
			item.questionTypeKey,
			{
				questionTypeKey: item.questionTypeKey,
				titleOverride: item.titleOverride,
				scoringRuleOverride: item.scoringRuleOverride ?? null,
				isDisabled: item.isDisabled,
			},
		])
	)

	const globalMap = new Map(globalTypes.map((item) => [item.key, item]))
	const allKeys = new Set<string>([...globalMap.keys(), ...overridesMap.keys()])
	const resolved: RuntimeQuestionType[] = []

	for (const key of allKeys) {
		const base = globalMap.get(key)
		if (!base) continue
		const merged = applyOverride(base, overridesMap.get(key))
		resolved.push(merged)
	}

	resolved.sort((a, b) => {
		if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
		return a.title.localeCompare(b.title, 'ru')
	})

	if (params.includeInactive) return resolved
	return resolved.filter((item) => item.isActive)
}

export async function getQuestionTypeMapForTest(params: {
	testId?: string
	includeInactive?: boolean
}): Promise<RuntimeQuestionTypesMap> {
	const list = params.testId
		? await getEffectiveQuestionTypesForTest({ testId: params.testId, includeInactive: params.includeInactive })
		: await getGlobalQuestionTypes({ includeInactive: params.includeInactive })

	return Object.fromEntries(list.map((item) => [item.key, item]))
}

export function validateQuestionWithType(
	question: {
		type: string
		promptText: string
		options?: unknown
		matchingPairs?: unknown
		correct: unknown
	},
	typesMap: RuntimeQuestionTypesMap
): string | null {
	const resolvedType = typesMap[question.type]
	if (!resolvedType) return `Неизвестный тип вопроса: ${question.type}`
	if (!resolvedType.isActive) return `Тип вопроса отключён: ${resolvedType.title}`

	return validateQuestionForSave({
		config: {
			uiTemplate: resolvedType.uiTemplate,
			mistakeMetric: resolvedType.scoringRule.mistakeMetric,
			validationSchema: resolvedType.validationSchema,
		},
		promptText: question.promptText,
		content: {
			options: question.options as QuestionContent['options'],
			matchingPairs: question.matchingPairs as QuestionContent['matchingPairs'],
		},
		key: question.correct,
	})
}

export function questionTypeToDefinition(type: RuntimeQuestionType): QuestionTypeDefinition {
	return {
		key: type.key,
		title: type.title,
		description: type.description,
		uiTemplate: type.uiTemplate,
		validationSchema: type.validationSchema,
		scoringRule: type.scoringRule,
		isSystem: type.isSystem,
		isActive: type.isActive,
	}
}
