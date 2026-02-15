'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { TestScoringRules } from '../types'

type ScoringQuestionType = keyof TestScoringRules

const scoringRuleMeta: Array<{ type: ScoringQuestionType; label: string; description: string }> = [
	{ type: 'short_answer', label: 'Краткий ответ', description: 'Одно слово или числовой ответ' },
	{ type: 'sequence', label: 'Последовательность', description: 'Проверка порядка цифр' },
	{ type: 'matching', label: 'Соответствие', description: 'Сопоставление утверждений и признаков' },
	{ type: 'checkbox', label: 'Множественный выбор', description: 'Выбор нескольких вариантов' },
	{ type: 'radio', label: 'Один вариант', description: 'Один правильный вариант ответа' },
]

type Props = {
	rules: TestScoringRules
	onChange: (rules: TestScoringRules) => void
}

export default function ScoringRulesEditor({ rules, onChange }: Props) {
	const updateRule = (
		type: ScoringQuestionType,
		patch: Partial<{
			formula: 'exact_match' | 'one_mistake_partial'
			correctPoints: number
			oneMistakePoints: number | undefined
		}>
	) => {
		const current = rules[type]
		const nextRule = { ...current, ...patch }
		if (nextRule.formula === 'exact_match') {
			delete nextRule.oneMistakePoints
		}

		onChange({
			...rules,
			[type]: nextRule,
		})
	}

	return (
		<div className="space-y-2">
			{scoringRuleMeta.map((item) => {
				const rule = rules[item.type]
				return (
					<div key={item.type} className="space-y-2 rounded-md border p-3">
						<div className="space-y-1">
							<p className="text-sm font-medium">{item.label}</p>
							<p className="text-muted-foreground text-xs">{item.description}</p>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							<div className="space-y-1">
								<Label className="text-xs">Формула</Label>
								<Select
									value={rule.formula}
									onValueChange={(value) =>
										updateRule(item.type, {
											formula: value as 'exact_match' | 'one_mistake_partial',
											oneMistakePoints:
												value === 'one_mistake_partial'
													? (rule.oneMistakePoints ?? Math.min(rule.correctPoints, 1))
													: undefined,
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="exact_match">Только полностью верно</SelectItem>
										<SelectItem value="one_mistake_partial">Полный + частичный за 1 ошибку</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1">
								<Label className="text-xs">Баллы за полностью верно</Label>
								<Input
									type="number"
									min={0}
									step={0.1}
									value={rule.correctPoints}
									onChange={(e) =>
										updateRule(item.type, {
											correctPoints: e.target.value === '' ? 0 : parseFloat(e.target.value),
										})
									}
								/>
							</div>
							{rule.formula === 'one_mistake_partial' ? (
								<div className="space-y-1 sm:col-span-2">
									<Label className="text-xs">Баллы за 1 ошибку</Label>
									<Input
										type="number"
										min={0}
										step={0.1}
										value={rule.oneMistakePoints ?? 0}
										onChange={(e) =>
											updateRule(item.type, {
												oneMistakePoints: e.target.value === '' ? 0 : parseFloat(e.target.value),
											})
										}
									/>
								</div>
							) : null}
						</div>
					</div>
				)
			})}
		</div>
	)
}
