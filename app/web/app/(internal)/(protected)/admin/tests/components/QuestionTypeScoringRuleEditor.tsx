'use client'

import { useEffect } from 'react'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
	MISTAKE_METRIC_DESCRIPTIONS,
	MISTAKE_METRIC_LABELS,
	TEMPLATE_META,
	getAllowedMistakeMetricsForTemplate,
	isMetricAllowedForTemplate,
	type MistakeMetric,
	type QuestionTypeScoringRule,
	type QuestionUiTemplate,
} from '../types'

type Props = {
	rule: QuestionTypeScoringRule
	uiTemplate: QuestionUiTemplate
	onChange: (next: QuestionTypeScoringRule) => void
	onlyFields?: boolean
}

type FieldsProps = Pick<Props, 'rule' | 'uiTemplate' | 'onChange'>

type UpdateRule = (patch: Partial<QuestionTypeScoringRule>) => void

type RuleBlockProps = {
	rule: QuestionTypeScoringRule
	update: UpdateRule
}

function FormulaField({ rule, update }: RuleBlockProps) {
	return (
		<div className="space-y-1">
			<Label className="text-xs">Формула</Label>
			<Select
				value={rule.formula}
				onValueChange={(value) =>
					update({
						formula: value as QuestionTypeScoringRule['formula'],
						oneMistakePoints:
							value === 'one_mistake_partial' ? (rule.oneMistakePoints ?? Math.min(rule.correctPoints, 1)) : undefined,
						tiers:
							value === 'tiers'
								? rule.tiers && rule.tiers.length > 0
									? rule.tiers
									: [{ maxMistakes: 1, points: 1 }]
								: undefined,
					})
				}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="exact_match">Только полностью верный ответ</SelectItem>
					<SelectItem value="one_mistake_partial">Полный балл и часть за одну ошибку</SelectItem>
					<SelectItem value="tiers">Шкала по числу ошибок</SelectItem>
				</SelectContent>
			</Select>
			<p className="text-xs text-muted-foreground">
				{rule.formula === 'exact_match'
					? 'Баллы начисляются только за ответ без ошибок.'
					: rule.formula === 'one_mistake_partial'
						? 'За ответ без ошибок — полный балл, за одну ошибку — отдельный балл ниже.'
						: 'Баллы зависят от числа ошибок: задайте ступени ниже.'}
			</p>
		</div>
	)
}

type MistakeMetricFieldProps = {
	rule: QuestionTypeScoringRule
	allowedMetrics: MistakeMetric[]
	update: UpdateRule
}

function MistakeMetricField({ rule, allowedMetrics, update }: MistakeMetricFieldProps) {
	return (
		<div className="space-y-1">
			<Label className="text-xs">Как считать ошибки</Label>
			<Select value={rule.mistakeMetric} onValueChange={(value) => update({ mistakeMetric: value as MistakeMetric })}>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{allowedMetrics.map((metric) => (
						<SelectItem key={metric} value={metric}>
							{MISTAKE_METRIC_LABELS[metric]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<p className="text-xs text-muted-foreground">{MISTAKE_METRIC_DESCRIPTIONS[rule.mistakeMetric]}</p>
		</div>
	)
}

function CorrectPointsField({ rule, update }: RuleBlockProps) {
	return (
		<div className="space-y-1">
			<Label className="text-xs">Баллы за полностью верно</Label>
			<Input
				type="number"
				min={0}
				step={0.1}
				value={rule.correctPoints}
				onChange={(e) => update({ correctPoints: e.target.value === '' ? 0 : Number(e.target.value) })}
			/>
			<p className="text-xs text-muted-foreground">Максимум, который можно получить за этот тип вопроса.</p>
		</div>
	)
}

function OneMistakePointsField({ rule, update }: RuleBlockProps) {
	if (rule.formula !== 'one_mistake_partial') return null

	return (
		<div className="space-y-1">
			<Label className="text-xs">Баллы за 1 ошибку</Label>
			<Input
				type="number"
				min={0}
				step={0.1}
				value={rule.oneMistakePoints ?? 0}
				onChange={(e) => update({ oneMistakePoints: e.target.value === '' ? 0 : Number(e.target.value) })}
			/>
			<p className="text-xs text-muted-foreground">
				Начисляется только когда ошибок ровно 1. Значение не должно быть больше полного балла.
			</p>
		</div>
	)
}

function TiersField({ rule, update }: RuleBlockProps) {
	if (rule.formula !== 'tiers') return null

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label className="text-xs">Шкала ошибок</Label>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						const next = [...(rule.tiers ?? []), { maxMistakes: 1, points: 0 }]
						update({ tiers: next })
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					Добавить ступень
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Ступень: если ошибок не больше порога, начисляются её баллы. Например, порог 1 и 1 балл — за одну ошибку
				начисляется 1 балл.
			</p>
			<div className="space-y-2">
				{(rule.tiers ?? []).map((tier, index) => (
					<div
						key={`${index}-${tier.maxMistakes}-${tier.points}`}
						className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-2xl border border-border/70 p-2"
					>
						<label className="space-y-1">
							<span className="text-xs text-muted-foreground">Ошибок не больше</span>
							<Input
								type="number"
								min={1}
								value={tier.maxMistakes}
								onChange={(e) => {
									const next = [...(rule.tiers ?? [])]
									next[index] = { ...next[index], maxMistakes: Math.max(1, Number(e.target.value || 1)) }
									update({ tiers: next })
								}}
							/>
						</label>
						<label className="space-y-1">
							<span className="text-xs text-muted-foreground">Баллы</span>
							<Input
								type="number"
								min={0}
								step={0.1}
								value={tier.points}
								onChange={(e) => {
									const next = [...(rule.tiers ?? [])]
									next[index] = { ...next[index], points: Math.max(0, Number(e.target.value || 0)) }
									update({ tiers: next })
								}}
							/>
						</label>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Удалить ступень ${index + 1}`}
							onClick={() => {
								const next = (rule.tiers ?? []).filter((_, tierIndex) => tierIndex !== index)
								update({ tiers: next })
							}}
						>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				))}
			</div>
		</div>
	)
}

export function QuestionTypeScoringRuleEditorHeader({ uiTemplate }: { uiTemplate: QuestionUiTemplate }) {
	const templateMeta = TEMPLATE_META[uiTemplate]
	return (
		<div className="rounded-2xl bg-secondary/50 px-3 py-2 text-xs">
			<p className="font-medium text-foreground">{templateMeta.label}</p>
			<p className="text-muted-foreground">{templateMeta.description}</p>
		</div>
	)
}

type EditorContentProps = {
	rule: QuestionTypeScoringRule
	update: UpdateRule
	allowedMetrics: MistakeMetric[]
}

function QuestionTypeScoringRuleEditorFieldsContent({ rule, update, allowedMetrics }: EditorContentProps) {
	return (
		<>
			<div className="grid gap-3 tab-sm:grid-cols-2">
				<FormulaField rule={rule} update={update} />
				<MistakeMetricField rule={rule} allowedMetrics={allowedMetrics} update={update} />
			</div>

			<CorrectPointsField rule={rule} update={update} />
			<OneMistakePointsField rule={rule} update={update} />
			<TiersField rule={rule} update={update} />
		</>
	)
}

export function QuestionTypeScoringRuleEditorFields({ rule, uiTemplate, onChange }: FieldsProps) {
	const update: UpdateRule = (patch) => {
		onChange({ ...rule, ...patch })
	}
	const allowedMetrics = getAllowedMistakeMetricsForTemplate(uiTemplate)

	useEffect(() => {
		if (!isMetricAllowedForTemplate(uiTemplate, rule.mistakeMetric)) {
			update({ mistakeMetric: allowedMetrics[0] })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [uiTemplate, rule.mistakeMetric])

	return <QuestionTypeScoringRuleEditorFieldsContent rule={rule} update={update} allowedMetrics={allowedMetrics} />
}

export function QuestionTypeScoringEditorContent({ rule, uiTemplate, onChange }: Props) {
	return <QuestionTypeScoringRuleEditorFields rule={rule} uiTemplate={uiTemplate} onChange={onChange} />
}

export default function QuestionTypeScoringRuleEditor({ rule, uiTemplate, onChange, onlyFields }: Props) {
	return (
		<div className="space-y-3 rounded-2xl border border-border/70 p-3">
			{!onlyFields && <QuestionTypeScoringRuleEditorHeader uiTemplate={uiTemplate} />}
			<QuestionTypeScoringRuleEditorFields rule={rule} uiTemplate={uiTemplate} onChange={onChange} />
		</div>
	)
}
