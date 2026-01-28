'use client'

import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import type { Question, QuestionType } from '../types'
import { createDefaultMatchingPairs, generateId } from '../types'
import MatchingEditor from './MatchingEditor'
import OptionsEditor from './OptionsEditor'

interface Props {
	question: Question
	onSave: (question: Question) => void
	onCancel: () => void
}

export default function QuestionEditor({ question, onSave, onCancel }: Props) {
	const [form, setForm] = useState<Question>({ ...question })

	const handlePromptTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setForm((prev) => ({ ...prev, promptText: e.target.value }))
	}, [])

	const handleExplanationTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setForm((prev) => ({ ...prev, explanationText: e.target.value || null }))
	}, [])

	const handlePointsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, points: parseFloat(e.target.value) || 1 }))
	}, [])

	const handleOrderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))
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
		<Dialog open onOpenChange={() => onCancel()}>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{question.id ? 'Редактирование вопроса' : 'Новый вопрос'}</DialogTitle>
					<DialogDescription>Настройте текст вопроса, варианты ответов и правильный ответ</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="content" className="w-full">
					<TabsList className="grid w-full grid-cols-3">
						<TabsTrigger value="content">Содержимое</TabsTrigger>
						<TabsTrigger value="answers">Варианты ответов</TabsTrigger>
						<TabsTrigger value="settings">Настройки</TabsTrigger>
					</TabsList>

					<TabsContent value="content" className="space-y-4 pt-4">
						<div className="space-y-2">
							<Label>Текст вопроса</Label>
							<Textarea
								value={form.promptText}
								onChange={handlePromptTextChange}
								placeholder="Введите текст вопроса... (поддерживается Markdown)"
								rows={6}
								className="font-mono text-sm"
							/>
							<p className="text-muted-foreground text-xs">
								Поддерживается Markdown: **жирный**, *курсив*, `код`, списки
							</p>
						</div>

						<div className="space-y-2">
							<Label>Пояснение к ответу (необязательно)</Label>
							<Textarea
								value={form.explanationText || ''}
								onChange={handleExplanationTextChange}
								placeholder="Пояснение, которое будет показано после ответа..."
								rows={4}
								className="font-mono text-sm"
							/>
						</div>
					</TabsContent>

					<TabsContent value="answers" className="space-y-4 pt-4">
						<div className="space-y-2">
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
					</TabsContent>

					<TabsContent value="settings" className="space-y-4 pt-4">
						<div className="space-y-2">
							<Label>Баллы за правильный ответ</Label>
							<Input
								type="number"
								min={0.1}
								step={0.1}
								value={form.points}
								onChange={handlePointsChange}
							/>
						</div>

						<div className="space-y-2">
							<Label>Порядок</Label>
							<Input type="number" min={0} value={form.order} onChange={handleOrderChange} />
							<p className="text-muted-foreground text-xs">Порядок вопроса в тесте (можно изменить перетаскиванием)</p>
						</div>
					</TabsContent>
				</Tabs>

				<DialogFooter className="pt-4">
					<Button variant="outline" onClick={onCancel}>
						Отмена
					</Button>
					<Button onClick={handleSave}>Сохранить</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
