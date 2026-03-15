'use client'

import { useRef } from 'react'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { Option } from '../types'
import { generateId } from '../types'

interface Props {
	mode: 'single' | 'multi'
	options: Option[]
	correct: string | string[] | Record<string, string>
	onChange: (options: Option[], correct: string | string[] | Record<string, string>) => void
}

export default function OptionsEditor({ mode, options, correct, onChange }: Props) {
	const isRadio = mode === 'single'
	const selectedIds = isRadio ? [correct as string] : Array.isArray(correct) ? correct : []

	const inputRefs = useRef<(HTMLInputElement | null)[]>([])

	const handleAddOption = () => {
		const newOption: Option = { id: generateId(), text: '' }
		onChange([...options, newOption], correct)
	}

	const handleRemoveOption = (id: string) => {
		if (options.length <= 2) return // Keep at least 2 options
		const newOptions = options.filter((o) => o.id !== id)

		// Update correct answer if removed option was selected
		let newCorrect = correct
		if (isRadio && correct === id) {
			newCorrect = ''
		} else if (Array.isArray(correct)) {
			newCorrect = correct.filter((c) => c !== id)
		}

		onChange(newOptions, newCorrect)
	}

	const handleTextChange = (id: string, text: string) => {
		const newOptions = options.map((o) => (o.id === id ? { ...o, text } : o))
		onChange(newOptions, correct)
	}

	const handleSelectOption = (id: string) => {
		if (isRadio) {
			onChange(options, id)
		} else {
			const currentSelected = Array.isArray(correct) ? correct : []
			const newSelected = currentSelected.includes(id)
				? currentSelected.filter((c) => c !== id)
				: [...currentSelected, id]
			onChange(options, newSelected)
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
		if (e.key !== 'Enter') return
		e.preventDefault()
		if (index < options.length - 1) {
			inputRefs.current[index + 1]?.focus()
		} else {
			const newIndex = options.length
			handleAddOption()
			queueMicrotask(() => {
				inputRefs.current[newIndex]?.focus()
			})
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<Label>Варианты ответов</Label>
				<Button type="button" variant="outline" size="sm" onClick={handleAddOption}>
					<Plus className="mr-2 h-4 w-4" />
					Добавить
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				{isRadio ? (
					<RadioGroup value={correct as string} onValueChange={handleSelectOption}>
						{options.map((option, index) => (
							<div key={option.id} className="flex items-center gap-2">
								<RadioGroupItem value={option.id} id={option.id} />
								<Input
									ref={(el) => { inputRefs.current[index] = el }}
									value={option.text}
									onChange={(e) => handleTextChange(option.id, e.target.value)}
									onKeyDown={(e) => handleKeyDown(e, index)}
									placeholder={`Вариант ${index + 1}`}
									className="flex-1"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => handleRemoveOption(option.id)}
									disabled={options.length <= 2}
								>
									<Trash2 className="text-destructive h-4 w-4" />
								</Button>
							</div>
						))}
					</RadioGroup>
				) : (
					options.map((option, index) => (
						<div key={option.id} className="flex items-center gap-2">
							<Checkbox
								id={option.id}
								checked={selectedIds.includes(option.id)}
								onCheckedChange={() => handleSelectOption(option.id)}
							/>
							<Input
								ref={(el) => { inputRefs.current[index] = el }}
								value={option.text}
								onChange={(e) => handleTextChange(option.id, e.target.value)}
								onKeyDown={(e) => handleKeyDown(e, index)}
								placeholder={`Вариант ${index + 1}`}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => handleRemoveOption(option.id)}
								disabled={options.length <= 2}
							>
								<Trash2 className="text-destructive h-4 w-4" />
							</Button>
						</div>
					))
				)}
			</div>

			<p className="text-muted-foreground text-xs">
				{isRadio ? 'Выберите один правильный ответ' : 'Отметьте все правильные ответы'}
			</p>
		</div>
	)
}
