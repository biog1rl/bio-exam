import { z } from 'zod'

export const CHART_IDS = ['testResults', 'studentProgress', 'profileAttempts', 'content', 'activity'] as const
export type ChartId = (typeof CHART_IDS)[number]

const ChartTypeSchema = z.enum(['bar', 'line', 'area'])
const AttemptXSchema = z.enum(['attempt', 'day', 'week', 'month', 'topic', 'test'])
const AttemptYSchema = z.enum(['best', 'average', 'last', 'points', 'count', 'passRate'])
const AttemptColorSchema = z.enum(['none', 'topic', 'test', 'result'])
const AttemptPeriodSchema = z.enum(['week', 'month', '3months', '6months', 'all'])
const LabelsSchema = z.enum(['none', 'value', 'name'])
const ContentSeriesSchema = z.enum(['published', 'drafts', 'questions'])
const ActivityMetricSchema = z.enum(['attempts', 'averageScore', 'both'])
const ActivityPeriodSchema = z.enum(['week', 'month'])

export const AttemptChartConfigSchema = z
	.object({
		type: ChartTypeSchema,
		x: AttemptXSchema,
		y: AttemptYSchema,
		color: AttemptColorSchema,
		period: AttemptPeriodSchema,
		legend: z.boolean(),
		labels: LabelsSchema,
	})
	.strict()

export const ContentChartConfigSchema = z
	.object({
		type: ChartTypeSchema,
		series: z
			.array(ContentSeriesSchema)
			.min(1)
			.refine((items) => new Set(items).size === items.length, 'series без повторов'),
		stacked: z.boolean(),
		limit: z.number().int().min(1).max(50).nullable(),
		legend: z.boolean(),
		labels: z.enum(['none', 'value']),
	})
	.strict()

export const ActivityChartConfigSchema = z
	.object({
		type: ChartTypeSchema,
		metric: ActivityMetricSchema,
		period: ActivityPeriodSchema,
		legend: z.boolean(),
		labels: z.enum(['none', 'value']),
	})
	.strict()

export type AttemptChartConfig = z.infer<typeof AttemptChartConfigSchema>
export type ContentChartConfig = z.infer<typeof ContentChartConfigSchema>
export type ActivityChartConfig = z.infer<typeof ActivityChartConfigSchema>

export type ChartConfigs = {
	testResults: AttemptChartConfig
	studentProgress: AttemptChartConfig
	profileAttempts: AttemptChartConfig
	content: ContentChartConfig
	activity: ActivityChartConfig
}

export const DEFAULT_CHART_CONFIGS: ChartConfigs = {
	testResults: {
		type: 'area',
		x: 'day',
		y: 'best',
		color: 'none',
		period: 'month',
		legend: false,
		labels: 'none',
	},
	studentProgress: {
		type: 'bar',
		x: 'attempt',
		y: 'best',
		color: 'topic',
		period: 'month',
		legend: true,
		labels: 'name',
	},
	profileAttempts: {
		type: 'bar',
		x: 'attempt',
		y: 'best',
		color: 'topic',
		period: 'month',
		legend: true,
		labels: 'name',
	},
	content: {
		type: 'bar',
		series: ['published', 'drafts', 'questions'],
		stacked: true,
		limit: 8,
		legend: true,
		labels: 'none',
	},
	activity: {
		type: 'bar',
		metric: 'attempts',
		period: 'month',
		legend: false,
		labels: 'none',
	},
}

const CHART_SCHEMAS = {
	testResults: AttemptChartConfigSchema,
	studentProgress: AttemptChartConfigSchema,
	profileAttempts: AttemptChartConfigSchema,
	content: ContentChartConfigSchema,
	activity: ActivityChartConfigSchema,
} as const

export const ChartConfigsPatchSchema = z
	.object({
		configs: z
			.object({
				testResults: AttemptChartConfigSchema.optional(),
				studentProgress: AttemptChartConfigSchema.optional(),
				profileAttempts: AttemptChartConfigSchema.optional(),
				content: ContentChartConfigSchema.optional(),
				activity: ActivityChartConfigSchema.optional(),
			})
			.strict(),
	})
	.strict()

export type ChartConfigsPatch = z.infer<typeof ChartConfigsPatchSchema>['configs']

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveOne<K extends ChartId>(id: K, stored: unknown): ChartConfigs[K] {
	const fallback = DEFAULT_CHART_CONFIGS[id]
	if (!isRecord(stored)) return fallback
	const schema = CHART_SCHEMAS[id] as unknown as z.ZodObject<z.ZodRawShape>
	const resolved: Record<string, unknown> = {}
	for (const [field, fieldSchema] of Object.entries(schema.shape)) {
		const parsed = (fieldSchema as z.ZodTypeAny).safeParse(stored[field])
		resolved[field] = parsed.success ? parsed.data : (fallback as Record<string, unknown>)[field]
	}
	return resolved as ChartConfigs[K]
}

export function resolveChartConfigs(stored: unknown): ChartConfigs {
	const source = isRecord(stored) ? stored : {}
	return {
		testResults: resolveOne('testResults', source.testResults),
		studentProgress: resolveOne('studentProgress', source.studentProgress),
		profileAttempts: resolveOne('profileAttempts', source.profileAttempts),
		content: resolveOne('content', source.content),
		activity: resolveOne('activity', source.activity),
	}
}
