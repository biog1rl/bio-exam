'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { Loader2, Plus, Trash2 } from 'lucide-react'

import { Editor } from '@/components/editor/editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { Question, QuestionType, QuestionTypeDefinition, QuestionUiTemplate } from '../types'
import { createDefaultMatchingPairs, generateId } from '../types'
import { AdminTestsSectionCard } from './AdminTestsSectionCard'
import MatchingEditor from './MatchingEditor'
import OptionsEditor from './OptionsEditor'

interface Props {
	question: Question
	questionTypes: QuestionTypeDefinition[]
	onSave: (question: Question) => void
	onDraftChange?: (question: Question) => void
	onCancel: () => void
	docPath?: string
	headerActions?: ReactNode
	isSaving?: boolean
}

function resolveTemplate(
	type: string,
	questionTypes: QuestionTypeDefinition[],
	fallback: QuestionUiTemplate | null
): QuestionUiTemplate | null {
	return questionTypes.find((item) => item.key === type)?.uiTemplate ?? fallback
}

export default function QuestionEditor({
	question,
	questionTypes,
	onSave,
	onDraftChange,
	onCancel,
	docPath,
	headerActions,
	isSaving,
}: Props) {
	const [form, setForm] = useState<Question>({ ...question })
	const availableQuestionTypes = questionTypes.filter((item) => item.isActive || item.key === form.type)
	const activeQuestionType = questionTypes.find((item) => item.key === form.type)
	const activeTemplate = resolveTemplate(form.type, questionTypes, form.questionUiTemplate ?? null)
	const acceptsMultipleShortAnswers =
		activeTemplate === 'short_text' && activeQuestionType?.scoringRule.mistakeMetric === 'compact_text_in_set'
	const acceptedAnswers = Array.isArray(form.correct) ? form.correct.map(String) : ['', '']

	useEffect(() => {
		setForm({ ...question })
	}, [question])

	useEffect(() => {
		onDraftChange?.(form)
	}, [form, onDraftChange])

	const handlePromptMdxChange = useCallback((mdx: string) => {
		setForm((prev) => ({ ...prev, promptText: mdx }))
	}, [])

	const handleTypeChange = (type: QuestionType) => {
		const selectedType = questionTypes.find((item) => item.key === type)
		if (!selectedType) return
		const template = selectedType.uiTemplate
		let newForm: Question = {
			...form,
			type,
			questionUiTemplate: template,
			questionTypeTitle: selectedType?.title ?? form.questionTypeTitle,
		}

		if (template === 'matching') {
			// Switch to matching
			newForm.options = null
			newForm.matchingPairs = form.matchingPairs || createDefaultMatchingPairs()
			newForm.correct = {}
		} else if (template === 'single_choice' || template === 'multi_choice') {
			// Switch to radio/checkbox
			newForm.matchingPairs = null
			newForm.options = form.options || [
				{ id: generateId(), text: '' },
				{ id: generateId(), text: '' },
			]
			newForm.correct = template === 'multi_choice' ? [] : ''
		} else if (template === 'short_text' && selectedType.scoringRule.mistakeMetric === 'compact_text_in_set') {
			// Switch to short answer with several accepted variants
			newForm.matchingPairs = null
			newForm.options = null
			const currentAnswers = Array.isArray(form.correct)
				? form.correct.map(String)
				: typeof form.correct === 'string'
					? [form.correct]
					: []
			newForm.correct = currentAnswers.length >= 2 ? currentAnswers : [currentAnswers[0] ?? '', '']
		} else {
			// Switch to short answer / sequence
			newForm.matchingPairs = null
			newForm.options = null
			newForm.correct = typeof form.correct === 'string' ? form.correct : ''
		}

		setForm(newForm)
	}

	const handleSave = () => {
		onSave(form)
	}

	return (
		<div className="flex flex-col gap-5">
			{/* Header */}
			<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm">
				<div className="tab:flex-row tab:items-end tab:justify-between flex flex-col gap-5">
					<div>
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">вопрос</p>
						<h1 className="text-foreground tab-sm:text-5xl mt-2 font-serif text-4xl leading-none">
							{question.id ? 'Редактирование' : 'Новый вопрос'}
						</h1>
						<p className="text-muted-foreground mt-3 max-w-2xl text-sm">
							Настройте формулировку, варианты ответа и правила проверки.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{headerActions}
						<Button variant="secondary" onClick={onCancel} className="rounded-full">
							Отмена
						</Button>
						<Button className="relative rounded-full" onClick={handleSave}>
							<span className={isSaving ? 'invisible' : ''}>Сохранить вопрос</span>
							{isSaving && (
								<Loader2 className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 animate-spin" />
							)}
						</Button>
					</div>
				</div>
			</section>

			<AdminTestsSectionCard title="Формулировка">
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
			</AdminTestsSectionCard>
			<AdminTestsSectionCard title="Ответ и проверка" contentClassName="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label>Тип вопроса</Label>
					<Select
						value={form.type}
						onValueChange={(v) => handleTypeChange(v as QuestionType)}
						disabled={availableQuestionTypes.length === 0}
					>
						<SelectTrigger>
							<SelectValue placeholder="Типы вопросов не загружены" />
						</SelectTrigger>
						<SelectContent>
							{availableQuestionTypes.map((item) => (
								<SelectItem key={item.key} value={item.key}>
									{item.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{availableQuestionTypes.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							Типы вопросов не загружены из БД. Проверьте настройки в разделе типов вопросов.
						</p>
					) : null}
				</div>

				{!activeTemplate ? (
					<p className="text-muted-foreground text-sm">
						Тип вопроса не настроен в БД. Выберите корректный тип в списке выше.
					</p>
				) : activeTemplate === 'matching' ? (
					<MatchingEditor
						pairs={form.matchingPairs || createDefaultMatchingPairs()}
						correct={(form.correct as Record<string, string>) || {}}
						onChange={(pairs, correct) => setForm({ ...form, matchingPairs: pairs, correct })}
					/>
				) : activeTemplate === 'single_choice' || activeTemplate === 'multi_choice' ? (
					<OptionsEditor
						mode={activeTemplate === 'single_choice' ? 'single' : 'multi'}
						options={form.options || []}
						correct={form.correct}
						onChange={(options, correct) => setForm({ ...form, options, correct })}
					/>
				) : acceptsMultipleShortAnswers ? (
					<div className="flex flex-col gap-3">
						<div>
							<Label>Допустимые правильные ответы</Label>
							<p className="text-muted-foreground mt-1 text-xs">
								Укажите минимум два варианта. Регистр и пробелы при проверке не учитываются.
							</p>
						</div>
						{acceptedAnswers.map((answer, index) => (
							<div key={index} className="flex items-end gap-2">
								<div className="flex min-w-0 flex-1 flex-col gap-2">
									<Label htmlFor={`correct-answer-${index}`}>Вариант {index + 1}</Label>
									<Input
										id={`correct-answer-${index}`}
										type="text"
										value={answer}
										onChange={(event) => {
											const nextAnswers = [...acceptedAnswers]
											nextAnswers[index] = event.target.value
											setForm((prev) => ({ ...prev, correct: nextAnswers }))
										}}
										placeholder={index === 0 ? 'Например: эксперимент' : 'Например: моделирование'}
									/>
								</div>
								<Button
									type="button"
									variant="outline"
									size="icon"
									disabled={acceptedAnswers.length <= 2}
									aria-label={`Удалить вариант ${index + 1}`}
									onClick={() =>
										setForm((prev) => ({
											...prev,
											correct: acceptedAnswers.filter((_, answerIndex) => answerIndex !== index),
										}))
									}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							className="self-start"
							onClick={() => setForm((prev) => ({ ...prev, correct: [...acceptedAnswers, ''] }))}
						>
							<Plus className="size-4" />
							Добавить вариант
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						<Label>Правильный ответ</Label>
						<Input
							type="text"
							inputMode={activeTemplate === 'sequence_digits' ? 'numeric' : 'text'}
							value={
								typeof form.correct === 'string'
									? form.correct
									: typeof form.correct === 'number'
										? String(form.correct)
										: ''
							}
							onChange={(e) => setForm((prev) => ({ ...prev, correct: e.target.value }))}
							placeholder={activeTemplate === 'sequence_digits' ? 'Например: 2314' : 'Введите правильный ответ'}
						/>
						<p className="text-muted-foreground text-xs">
							{activeTemplate === 'sequence_digits'
								? 'Используйте только цифры без пробелов.'
								: 'Ответ сравнивается как строка (без учета регистра и пробелов).'}
						</p>
					</div>
				)}
			</AdminTestsSectionCard>
		</div>
	)
}
