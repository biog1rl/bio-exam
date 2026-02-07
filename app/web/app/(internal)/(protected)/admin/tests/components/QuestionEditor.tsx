'use client'

import { type ReactNode, useCallback, useState } from 'react'

import { Editor } from '@/components/editor/editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { Question, QuestionType } from '../types'
import { createDefaultMatchingPairs, generateId } from '../types'
import MatchingEditor from './MatchingEditor'
import OptionsEditor from './OptionsEditor'

interface Props {
	question: Question
	onSave: (question: Question) => void
	onCancel: () => void
	docPath?: string
	headerActions?: ReactNode
}

export default function QuestionEditor({ question, onSave, onCancel, docPath, headerActions }: Props) {
	const [form, setForm] = useState<Question>({ ...question })

	const handlePromptMdxChange = useCallback((mdx: string) => {
		setForm((prev) => ({ ...prev, promptText: mdx }))
	}, [])

	// const handleExplanationMdxChange = useCallback((mdx: string) => {
	// 	setForm((prev) => ({ ...prev, explanationText: mdx || null }))
	// }, [])

	const handlePointsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, points: parseFloat(e.target.value) || 1 }))
	}, [])

	const handleTypeChange = (type: QuestionType) => {
		let newForm: Question = { ...form, type }

		if (type === 'matching') {
			// Switch to matching
			newForm.options = null
			newForm.matchingPairs = form.matchingPairs || createDefaultMatchingPairs()
			newForm.correct = {}
		} else {
			// Switch to radio/checkbox
			newForm.matchingPairs = null
			newForm.options = form.options || [
				{ id: generateId(), text: '' },
				{ id: generateId(), text: '' },
			]
			newForm.correct = type === 'checkbox' ? [] : ''
		}

		setForm(newForm)
	}

	const handleSave = () => {
		onSave(form)
	}

	return (
		<div className="flex flex-col gap-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div>
						<h1 className="text-2xl font-semibold">{question.id ? 'Редактирование вопроса' : 'Новый вопрос'}</h1>
						<p className="text-muted-foreground">Настройте текст вопроса, варианты ответов и правильный ответ</p>
					</div>
				</div>
				<div className="flex gap-2">
					{headerActions}
					<Button variant="secondary" onClick={onCancel}>
						Отмена
					</Button>
					<Button onClick={handleSave}>Сохранить вопрос</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Вопрос</CardTitle>
				</CardHeader>
				<CardContent>
					<Editor
						initialMdxContent={question.promptText}
						onMdxChange={handlePromptMdxChange}
						placeholder="Введите текст вопроса..."
						preset="full"
						docPath={docPath}
					/>

					{/* <div className="space-y-2">
								<Label>Пояснение к ответу (необязательно)</Label>
								<Editor
									initialMdxContent={question.explanationText || ''}
									onMdxChange={handleExplanationMdxChange}
									placeholder="Пояснение, которое будет показано после ответа..."
									preset="full"
									docPath={docPath}
								/>
							</div> */}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Ответ</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>Тип вопроса</Label>
						<Select value={form.type} onValueChange={(v) => handleTypeChange(v as QuestionType)}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="radio">Один правильный ответ</SelectItem>
								<SelectItem value="checkbox">Несколько правильных ответов</SelectItem>
								<SelectItem value="matching">Сопоставление</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{form.type === 'matching' ? (
						<MatchingEditor
							pairs={form.matchingPairs || createDefaultMatchingPairs()}
							correct={(form.correct as Record<string, string>) || {}}
							onChange={(pairs, correct) => setForm({ ...form, matchingPairs: pairs, correct })}
						/>
					) : (
						<OptionsEditor
							type={form.type}
							options={form.options || []}
							correct={form.correct}
							onChange={(options, correct) => setForm({ ...form, options, correct })}
						/>
					)}

					<div className="flex flex-col gap-2">
						<Label>Баллы за правильный ответ</Label>
						<Input type="number" min={0.1} step={0.1} value={form.points} onChange={handlePointsChange} />
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
