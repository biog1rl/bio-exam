import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { questionTypes, testQuestionTypeOverrides } from '../../db/schema.js'
import {
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	isMistakeMetricAllowedForTemplate,
	type QuestionTypeDefinition,
	type QuestionTypeScoringRule,
} from './question-types.js'
import { createDefaultScoringRuleForTemplate, type QuestionUiTemplate } from './question-types.js'

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

const EMPTY_VALIDATION_SCHEMA: ValidationSchema = {}

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

export async function getGlobalQuestionTypes(params?: {
	includeInactive?: boolean
}): Promise<RuntimeQuestionType[]> {
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

function stringIdsArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null
	if (value.some((item) => typeof item !== 'string')) return null
	return value
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	return Object.values(value).every((entry) => typeof entry === 'string')
}

function hasDuplicates(values: string[]): boolean {
	return new Set(values).size !== values.length
}

function validateOptionsCount(
	optionsCount: number,
	validationSchema: ValidationSchema | null
): string | null {
	const validation = validationSchema ?? EMPTY_VALIDATION_SCHEMA
	if (typeof validation.minOptions === 'number' && optionsCount < validation.minOptions) {
		return `Минимум вариантов: ${validation.minOptions}`
	}
	if (typeof validation.maxOptions === 'number' && optionsCount > validation.maxOptions) {
		return `Максимум вариантов: ${validation.maxOptions}`
	}
	return null
}

function validateByTemplate(params: {
	template: QuestionUiTemplate
	validationSchema: ValidationSchema | null
	options: unknown
	matchingPairs: unknown
	correct: unknown
}): string | null {
	const { template, validationSchema, options, matchingPairs, correct } = params

	if (template === 'single_choice' || template === 'multi_choice') {
		if (!Array.isArray(options) || options.length < 2) return 'Нужно минимум 2 варианта ответа'
		const optionIds = options
			.map((option) => (option && typeof option === 'object' ? (option as { id?: unknown }).id : null))
			.filter((id): id is string => typeof id === 'string')
		if (optionIds.length !== options.length) return 'Все варианты должны иметь строковый id'
		if (hasDuplicates(optionIds)) return 'ID вариантов ответа должны быть уникальными'

		const optionsCountError = validateOptionsCount(options.length, validationSchema)
		if (optionsCountError) return optionsCountError

		if (template === 'single_choice') {
			if (typeof correct !== 'string' || !optionIds.includes(correct)) {
				return 'Нужен один корректный вариант из списка'
			}
			return null
		}

		const selected = stringIdsArray(correct)
		if (!selected || selected.length === 0) return 'Для множественного выбора нужен список правильных вариантов'
		if (selected.some((item) => !optionIds.includes(item))) return 'correct содержит несуществующий id варианта'
		if (hasDuplicates(selected)) return 'В correct не должно быть дубликатов'

		const validation = validationSchema ?? EMPTY_VALIDATION_SCHEMA
		if (typeof validation.exactChoiceCount === 'number' && selected.length !== validation.exactChoiceCount) {
			return `Нужно выбрать ровно ${validation.exactChoiceCount} вариантов`
		}
		return null
	}

	if (template === 'matching') {
		const pairs = matchingPairs as
			| {
					left?: Array<{ id?: unknown; text?: unknown }>
					right?: Array<{ id?: unknown; text?: unknown }>
			  }
			| null
			| undefined
		if (!pairs || !Array.isArray(pairs.left) || !Array.isArray(pairs.right)) {
			return 'Для сопоставления нужны left/right массивы'
		}
		if (pairs.left.length < 2 || pairs.right.length < 2) {
			return 'Для сопоставления нужно минимум 2 элемента слева и справа'
		}

		const leftIds = pairs.left.map((item) => item.id).filter((id): id is string => typeof id === 'string')
		const rightIds = pairs.right.map((item) => item.id).filter((id): id is string => typeof id === 'string')
		if (leftIds.length !== pairs.left.length || rightIds.length !== pairs.right.length) {
			return 'Каждый элемент matching должен иметь строковый id'
		}
		if (hasDuplicates(leftIds) || hasDuplicates(rightIds)) return 'ID элементов matching должны быть уникальными'

		if (!isRecordOfStrings(correct)) return 'correct для matching должен быть объектом соответствий'
		for (const leftId of leftIds) {
			const mapped = correct[leftId]
			if (!mapped || !rightIds.includes(mapped)) {
				return 'Для каждого элемента слева нужно указать корректный элемент справа'
			}
		}
		return null
	}

	if (template === 'short_text') {
		if (typeof correct !== 'string' || correct.trim().length === 0) {
			return 'Для краткого ответа нужен непустой строковый correct'
		}
		return null
	}

	// sequence_digits
	if (typeof correct !== 'string') return 'Для последовательности correct должен быть строкой'
	const normalized = correct.replace(/\s+/g, '')
	if (!/^\d+$/.test(normalized)) return 'Для последовательности используйте только цифры без пробелов'
	return null
}

export function validateQuestionWithType(
	question: {
		type: string
		options?: unknown
		matchingPairs?: unknown
		correct: unknown
	},
	typesMap: RuntimeQuestionTypesMap
): string | null {
	const resolvedType = typesMap[question.type]
	if (!resolvedType) return `Неизвестный тип вопроса: ${question.type}`
	if (!resolvedType.isActive) return `Тип вопроса отключён: ${resolvedType.title}`

	return validateByTemplate({
		template: resolvedType.uiTemplate,
		validationSchema: resolvedType.validationSchema,
		options: question.options,
		matchingPairs: question.matchingPairs,
		correct: question.correct,
	})
}

export async function upsertTestQuestionTypeOverride(params: {
	testId: string
	questionTypeKey: string
	titleOverride?: string | null
	scoringRuleOverride?: unknown
	isDisabled?: boolean
	updatedBy?: string | null
}): Promise<void> {
	const existing = await db.query.testQuestionTypeOverrides.findFirst({
		where: and(
			eq(testQuestionTypeOverrides.testId, params.testId),
			eq(testQuestionTypeOverrides.questionTypeKey, params.questionTypeKey)
		),
	})

	let nextScoringRule: QuestionTypeScoringRule | null = null
	if (params.scoringRuleOverride != null) {
		const baseType = await db.query.questionTypes.findFirst({
			where: eq(questionTypes.key, params.questionTypeKey),
		})
		if (!baseType) {
			throw new Error(`Question type not found: ${params.questionTypeKey}`)
		}
		nextScoringRule = parseScoringRule(params.scoringRuleOverride, baseType.uiTemplate)
	}

	if (!existing) {
		await db.insert(testQuestionTypeOverrides).values({
			testId: params.testId,
			questionTypeKey: params.questionTypeKey,
			titleOverride: params.titleOverride ?? null,
			scoringRuleOverride: nextScoringRule,
			isDisabled: params.isDisabled ?? false,
			createdBy: params.updatedBy ?? null,
			updatedBy: params.updatedBy ?? null,
		})
		return
	}

	await db
		.update(testQuestionTypeOverrides)
		.set({
			titleOverride: params.titleOverride ?? null,
			scoringRuleOverride: nextScoringRule,
			isDisabled: params.isDisabled ?? false,
			updatedAt: new Date(),
			updatedBy: params.updatedBy ?? null,
		})
		.where(eq(testQuestionTypeOverrides.id, existing.id))
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
