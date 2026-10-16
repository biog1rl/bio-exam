import { OPEN_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from '@bio-exam/exam-core'

import type { PublicTestQuestion, TestAnswerValue } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'

type Props = {
	question: PublicTestQuestion
	answer: TestAnswerValue | undefined
	disabled: boolean
	readOnly?: boolean
	onSelectRadio: (questionId: string, optionId: string) => void
	onToggleCheckbox: (questionId: string, optionId: string) => void
	onInputTextAnswer: (questionId: string, value: string) => void
	onSelectMatching: (questionId: string, leftId: string, rightId: string) => void
}

export function QuestionInput({
	question,
	answer,
	disabled,
	readOnly = false,
	onSelectRadio,
	onToggleCheckbox,
	onInputTextAnswer,
	onSelectMatching,
}: Props) {
	const template = question.questionUiTemplate

	if (template === 'single_choice' && Array.isArray(question.options)) {
		return (
			<RadioGroup
				className="w-fit space-y-2"
				value={typeof answer === 'string' ? answer : ''}
				onValueChange={(value) => onSelectRadio(question.id, value)}
				disabled={disabled || readOnly}
			>
				{question.options.map((option) => {
					const inputId = `q-${question.id}-opt-${option.id}`
					return (
						<div key={option.id} className="flex items-center gap-2">
							<RadioGroupItem id={inputId} value={option.id} />
							<Label htmlFor={inputId} className="cursor-pointer font-normal">
								{option.text}
							</Label>
						</div>
					)
				})}
			</RadioGroup>
		)
	}

	if (template === 'multi_choice' && Array.isArray(question.options)) {
		return (
			<div className="space-y-2">
				{question.options.map((option) => {
					const inputId = `q-${question.id}-opt-${option.id}`
					const selected = Array.isArray(answer) && answer.includes(option.id)
					return (
						<div key={option.id} className="flex items-center gap-2">
							<Checkbox
								id={inputId}
								checked={selected}
								onCheckedChange={() => onToggleCheckbox(question.id, option.id)}
								disabled={disabled || readOnly}
							/>
							<Label htmlFor={inputId} className="cursor-pointer font-normal">
								{option.text}
							</Label>
						</div>
					)
				})}
			</div>
		)
	}

	if (template === 'short_text' || template === 'sequence_digits') {
		return (
			<div className="max-w-xs space-y-1">
				<Input
					type="text"
					inputMode={template === 'sequence_digits' ? 'numeric' : 'text'}
					value={typeof answer === 'string' ? answer : ''}
					onChange={(event) => onInputTextAnswer(question.id, event.target.value)}
					placeholder={
						readOnly ? undefined : template === 'sequence_digits' ? 'Введите последовательность цифр' : 'Введите ответ'
					}
					maxLength={SHORT_TEXT_MAX_LENGTH}
					readOnly={readOnly}
					disabled={disabled && !readOnly}
					className={cn('bg-white', readOnly && 'read-only:bg-muted')}
				/>
				{template === 'sequence_digits' ? (
					<p className="text-xs text-muted-foreground">Последовательность вводится цифрами без пробелов.</p>
				) : null}
			</div>
		)
	}

	if (template === 'open') {
		const value = typeof answer === 'string' ? answer : ''
		const inputId = `q-${question.id}-open`
		const counterId = `${inputId}-count`
		return (
			<div className="space-y-1">
				<Textarea
					id={inputId}
					value={value}
					onChange={(event) => onInputTextAnswer(question.id, event.target.value)}
					placeholder={readOnly ? undefined : 'Введите развёрнутый ответ'}
					maxLength={OPEN_TEXT_MAX_LENGTH}
					readOnly={readOnly}
					disabled={disabled && !readOnly}
					rows={8}
					aria-label="Развёрнутый ответ"
					aria-describedby={counterId}
					className={cn('min-h-40 bg-white', readOnly && 'read-only:bg-muted')}
				/>
				<p id={counterId} className="text-xs text-muted-foreground tabular-nums">
					{value.length} из {OPEN_TEXT_MAX_LENGTH} знаков
				</p>
			</div>
		)
	}

	if (template === 'matching' && question.matchingPairs) {
		const selected = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}
		return (
			<div className="space-y-3">
				{question.matchingPairs.left.map((left) => (
					<div key={left.id} className="grid gap-2 tab-sm:grid-cols-[1fr_13.75rem] tab-sm:items-center">
						<div>{left.text}</div>
						<Select
							value={selected[left.id] || undefined}
							onValueChange={(value) => onSelectMatching(question.id, left.id, value)}
							disabled={disabled || readOnly}
						>
							<SelectTrigger className="w-full tab-sm:w-55">
								<SelectValue placeholder="Выберите вариант" />
							</SelectTrigger>
							<SelectContent>
								{question.matchingPairs?.right.map((right) => (
									<SelectItem key={right.id} value={right.id}>
										{right.text}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				))}
			</div>
		)
	}

	return null
}
