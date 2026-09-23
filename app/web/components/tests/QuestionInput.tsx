import type { PublicTestQuestion, TestAnswerValue } from '@/lib/tests/types'

import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type Props = {
	question: PublicTestQuestion
	answer: TestAnswerValue | undefined
	disabled: boolean
	onSelectRadio: (questionId: string, optionId: string) => void
	onToggleCheckbox: (questionId: string, optionId: string) => void
	onInputTextAnswer: (questionId: string, value: string) => void
	onSelectMatching: (questionId: string, leftId: string, rightId: string) => void
}

export function QuestionInput({
	question,
	answer,
	disabled,
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
				disabled={disabled}
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
								disabled={disabled}
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
					placeholder={template === 'sequence_digits' ? 'Введите последовательность цифр' : 'Введите ответ'}
					disabled={disabled}
					className="bg-white"
				/>
				{template === 'sequence_digits' ? (
					<p className="text-muted-foreground text-xs">Последовательность вводится цифрами без пробелов.</p>
				) : null}
			</div>
		)
	}

	if (template === 'matching' && question.matchingPairs) {
		const selected = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}
		return (
			<div className="space-y-3">
				{question.matchingPairs.left.map((left) => (
					<div key={left.id} className="tab-sm:grid-cols-[1fr_13.75rem] tab-sm:items-center grid gap-2">
						<div>{left.text}</div>
						<Select
							value={selected[left.id] || undefined}
							onValueChange={(value) => onSelectMatching(question.id, left.id, value)}
							disabled={disabled}
						>
							<SelectTrigger className="tab-sm:w-55 w-full">
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
