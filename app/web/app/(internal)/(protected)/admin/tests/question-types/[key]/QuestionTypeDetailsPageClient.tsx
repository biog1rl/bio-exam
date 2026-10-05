'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ArrowLeft, RotateCcw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { failureMessage } from '@/lib/http/errors'
import {
	adminTestsKeys,
	adminTestsListFetcher,
	deleteQuestionType,
	deleteTestQuestionTypeOverride,
	questionTypeFetcher,
	questionTypesFetcher,
	saveQuestionType,
	saveTestQuestionTypeOverride,
	topicsListFetcher,
} from '@/lib/tests/admin-api'

import QuestionTypeScoringRuleEditor from '../../components/QuestionTypeScoringRuleEditor'
import type { QuestionTypeDefinition, QuestionTypeScoringRule, QuestionUiTemplate } from '../../types'
import { TEMPLATE_META, createDefaultQuestionTypeScoringRule } from '../../types'

const FORM_SWR_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false }

const TYPE_SWR_OPTIONS = { ...FORM_SWR_OPTIONS, revalidateOnMount: false }

type GlobalForm = {
	title: string
	description: string
	uiTemplate: QuestionUiTemplate
	isActive: boolean
	scoringRule: QuestionTypeScoringRule
	validationMinOptions: string
	validationMaxOptions: string
	validationExactChoiceCount: string
}

function toGlobalForm(questionType: QuestionTypeDefinition): GlobalForm {
	return {
		title: questionType.title,
		description: questionType.description || '',
		uiTemplate: questionType.uiTemplate,
		isActive: questionType.isActive,
		scoringRule: questionType.scoringRule,
		...toValidationFields(questionType.validationSchema),
	}
}

function toastFailure(outcome: Parameters<typeof failureMessage>[0], fallback: string) {
	const message = failureMessage(outcome, fallback)
	if (message) toast.error(message)
}

type Props = {
	typeKey: string
}

function toValidationFields(validationSchema: QuestionTypeDefinition['validationSchema']) {
	return {
		validationMinOptions: validationSchema?.minOptions != null ? String(validationSchema.minOptions) : '',
		validationMaxOptions: validationSchema?.maxOptions != null ? String(validationSchema.maxOptions) : '',
		validationExactChoiceCount:
			validationSchema?.exactChoiceCount != null ? String(validationSchema.exactChoiceCount) : '',
	}
}

function toValidationPayload(state: {
	validationMinOptions: string
	validationMaxOptions: string
	validationExactChoiceCount: string
}) {
	if (!state.validationMinOptions && !state.validationMaxOptions && !state.validationExactChoiceCount) return null
	return {
		minOptions: state.validationMinOptions ? Number(state.validationMinOptions) : undefined,
		maxOptions: state.validationMaxOptions ? Number(state.validationMaxOptions) : undefined,
		exactChoiceCount: state.validationExactChoiceCount ? Number(state.validationExactChoiceCount) : undefined,
	}
}

export default function QuestionTypeDetailsPageClient({ typeKey }: Props) {
	const { confirm, alertDialog } = useUiAlertDialog()
	const [savingGlobal, setSavingGlobal] = useState(false)
	const [savingOverride, setSavingOverride] = useState(false)
	const [selectedTopicId, setSelectedTopicId] = useState('')
	const [selectedTestId, setSelectedTestId] = useState('')

	const {
		data: typeData,
		error: typeError,
		mutate: mutateType,
		isLoading: typeLoading,
	} = useSWR(adminTestsKeys.questionType(typeKey), questionTypeFetcher, TYPE_SWR_OPTIONS)
	const typeLoadFailed = typeError !== undefined && typeData === undefined
	const { data: topicsData } = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const { data: testsData } = useSWR(adminTestsKeys.list(), adminTestsListFetcher)

	const testsForTopic = useMemo(
		() => (testsData?.tests ?? []).filter((test) => test.topicId === selectedTopicId),
		[testsData?.tests, selectedTopicId]
	)

	const { data: testScopedData, mutate: mutateTestScoped } = useSWR(
		selectedTestId ? adminTestsKeys.scoringTest(selectedTestId) : null,
		questionTypesFetcher,
		FORM_SWR_OPTIONS
	)
	const testScopedType = useMemo(
		() => testScopedData?.questionTypes.find((item) => item.key === typeKey) ?? null,
		[testScopedData?.questionTypes, typeKey]
	)

	const [globalForm, setGlobalForm] = useState<GlobalForm | null>(null)
	const activeTypeKeyRef = useRef(typeKey)

	const [overrideForm, setOverrideForm] = useState<{
		titleOverride: string
		scoringRuleOverride: QuestionTypeScoringRule | null
		isDisabled: boolean
	} | null>(null)

	const breadcrumbLabels = useMemo(() => {
		const title = globalForm?.title?.trim() || typeData?.questionType?.title
		if (!title) return {}
		return {
			[`/admin/tests/question-types/${typeKey}`]: title,
		}
	}, [globalForm?.title, typeData?.questionType?.title, typeKey])

	const loadType = useCallback(
		async (key: string) => {
			const fresh = await mutateType()
			if (!fresh?.questionType || activeTypeKeyRef.current !== key) return
			setGlobalForm(toGlobalForm(fresh.questionType))
		},
		[mutateType]
	)

	useEffect(() => {
		activeTypeKeyRef.current = typeKey
		void loadType(typeKey)
	}, [typeKey, loadType])

	const reseedGlobalForm = () => loadType(typeKey)

	useEffect(() => {
		if (!testScopedType) return
		setOverrideForm({
			titleOverride: testScopedType.override?.titleOverride || '',
			scoringRuleOverride: testScopedType.override?.scoringRuleOverride ?? null,
			isDisabled: Boolean(testScopedType.override?.isDisabled),
		})
	}, [testScopedType])

	const saveGlobal = async () => {
		if (!globalForm) return
		setSavingGlobal(true)
		const outcome = await saveQuestionType({
			key: typeKey,
			body: {
				title: globalForm.title.trim(),
				description: globalForm.description.trim() || null,
				uiTemplate: globalForm.uiTemplate,
				isActive: globalForm.isActive,
				scoringRule: globalForm.scoringRule,
				validationSchema: toValidationPayload(globalForm),
			},
		})
		if (!outcome.ok) {
			setSavingGlobal(false)
			toastFailure(outcome, 'Не удалось сохранить тип вопроса')
			return
		}
		toast.success('Тип вопроса обновлен')
		await reseedGlobalForm()
		await mutateTestScoped()
		setSavingGlobal(false)
	}

	const removeType = async () => {
		const confirmed = await confirm({
			title: 'Отключить тип вопроса?',
			description: 'Тип станет недоступен для новых вопросов.',
			confirmText: 'Отключить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return
		setSavingGlobal(true)
		const outcome = await deleteQuestionType(typeKey)
		if (!outcome.ok) {
			setSavingGlobal(false)
			toastFailure(outcome, 'Не удалось отключить тип')
			return
		}
		toast.success('Тип вопроса отключен')
		await reseedGlobalForm()
		setSavingGlobal(false)
	}

	const saveOverride = async () => {
		if (!selectedTestId || !overrideForm) return
		setSavingOverride(true)
		const outcome = await saveTestQuestionTypeOverride(selectedTestId, typeKey, {
			titleOverride: overrideForm.titleOverride.trim() || null,
			scoringRuleOverride: overrideForm.scoringRuleOverride,
			isDisabled: overrideForm.isDisabled,
		})
		if (!outcome.ok) {
			setSavingOverride(false)
			toastFailure(outcome, 'Не удалось сохранить override')
			return
		}
		toast.success('Override для теста сохранен')
		await mutateTestScoped()
		setSavingOverride(false)
	}

	const clearOverride = async () => {
		if (!selectedTestId) return
		setSavingOverride(true)
		const outcome = await deleteTestQuestionTypeOverride(selectedTestId, typeKey)
		if (!outcome.ok) {
			setSavingOverride(false)
			toastFailure(outcome, 'Не удалось удалить override')
			return
		}
		toast.success('Override удален')
		await mutateTestScoped()
		setSavingOverride(false)
	}

	if (typeLoading || !globalForm || !typeData?.questionType) {
		return (
			<div className="space-y-4">
				<SetBreadcrumbsLabels labels={breadcrumbLabels} />
				<Button variant="outline" asChild>
					<Link href="/admin/tests/question-types">
						<ArrowLeft className="mr-2 h-4 w-4" />К типам вопросов
					</Link>
				</Button>
				{typeLoadFailed ? (
					<LoadErrorAlert title="Не удалось загрузить тип вопроса" error={typeError} onRetry={reseedGlobalForm} />
				) : (
					<Card>
						<CardContent className="py-8 text-sm">Загрузка...</CardContent>
					</Card>
				)}
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">{typeData.questionType.title}</h1>
					<p className="text-sm text-muted-foreground">
						`{typeData.questionType.key}` • {typeData.questionType.uiTemplate}
						{typeData.questionType.isSystem ? ' • system' : ''}
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link href="/admin/tests/question-types">
						<ArrowLeft className="mr-2 h-4 w-4" />К типам вопросов
					</Link>
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Глобальная конфигурация типа</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<Label>Название</Label>
							<Input
								value={globalForm.title}
								onChange={(e) => setGlobalForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
							/>
							<p className="text-xs text-muted-foreground">Отображается в выборе типа вопроса и в настройках.</p>
						</div>
						<div className="space-y-1">
							<Label>UI шаблон</Label>
							<Select
								value={globalForm.uiTemplate}
								onValueChange={(value) =>
									setGlobalForm((prev) =>
										prev
											? {
													...prev,
													uiTemplate: value as QuestionUiTemplate,
													scoringRule: createDefaultQuestionTypeScoringRule(value as QuestionUiTemplate),
												}
											: prev
									)
								}
								disabled={typeData.questionType.isSystem}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="short_text">short_text</SelectItem>
									<SelectItem value="sequence_digits">sequence_digits</SelectItem>
									<SelectItem value="single_choice">single_choice</SelectItem>
									<SelectItem value="multi_choice">multi_choice</SelectItem>
									<SelectItem value="matching">matching</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Шаблон определяет формат ответа и допустимую метрику ошибок.
							</p>
						</div>
					</div>
					<div className="space-y-1">
						<Label>Описание</Label>
						<Textarea
							value={globalForm.description}
							onChange={(e) => setGlobalForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
							rows={2}
						/>
						<p className="text-xs text-muted-foreground">Используйте описание как инструкцию для составителя тестов.</p>
					</div>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Памятка и пример</CardTitle>
						</CardHeader>
						<CardContent className="space-y-1 text-sm">
							<p className="font-medium">{TEMPLATE_META[globalForm.uiTemplate].label}</p>
							<p className="text-muted-foreground">{TEMPLATE_META[globalForm.uiTemplate].description}</p>
							<p className="text-muted-foreground">
								Формат ответа: {TEMPLATE_META[globalForm.uiTemplate].answerFormat}
							</p>
							<p className="text-muted-foreground">Пример: {TEMPLATE_META[globalForm.uiTemplate].example}</p>
						</CardContent>
					</Card>
					<div className="grid gap-3 md:grid-cols-3">
						<div className="space-y-1">
							<Label>minOptions</Label>
							<Input
								type="number"
								min={0}
								value={globalForm.validationMinOptions}
								onChange={(e) =>
									setGlobalForm((prev) => (prev ? { ...prev, validationMinOptions: e.target.value } : prev))
								}
							/>
							<p className="text-xs text-muted-foreground">Нижняя граница количества вариантов ответа.</p>
						</div>
						<div className="space-y-1">
							<Label>maxOptions</Label>
							<Input
								type="number"
								min={0}
								value={globalForm.validationMaxOptions}
								onChange={(e) =>
									setGlobalForm((prev) => (prev ? { ...prev, validationMaxOptions: e.target.value } : prev))
								}
							/>
							<p className="text-xs text-muted-foreground">Верхняя граница количества вариантов ответа.</p>
						</div>
						<div className="space-y-1">
							<Label>exactChoiceCount</Label>
							<Input
								type="number"
								min={0}
								value={globalForm.validationExactChoiceCount}
								onChange={(e) =>
									setGlobalForm((prev) => (prev ? { ...prev, validationExactChoiceCount: e.target.value } : prev))
								}
							/>
							<p className="text-xs text-muted-foreground">
								Фиксированное число правильных выборов. Пример: для задания "выберите 3" укажите `3`.
							</p>
						</div>
					</div>
					<div className="flex items-center justify-between rounded border p-3">
						<div>
							<p className="text-sm font-medium">Активен</p>
							<p className="text-xs text-muted-foreground">Если выключить, тип нельзя выбрать в новых вопросах</p>
						</div>
						<Switch
							checked={globalForm.isActive}
							onCheckedChange={(checked) => setGlobalForm((prev) => (prev ? { ...prev, isActive: checked } : prev))}
						/>
					</div>
					<div className="space-y-2">
						<Label>Формула начисления баллов</Label>
						<QuestionTypeScoringRuleEditor
							rule={globalForm.scoringRule}
							uiTemplate={globalForm.uiTemplate}
							onChange={(next) => setGlobalForm((prev) => (prev ? { ...prev, scoringRule: next } : prev))}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button onClick={saveGlobal} disabled={savingGlobal}>
							<Save className="mr-2 h-4 w-4" />
							Сохранить глобально
						</Button>
						{!typeData.questionType.isSystem ? (
							<Button variant="outline" onClick={removeType} disabled={savingGlobal}>
								<Trash2 className="mr-2 h-4 w-4 text-destructive" />
								Отключить тип
							</Button>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Override для конкретного теста</CardTitle>
					<CardDescription>Настройка этого типа вопроса только для выбранного теста</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<Label>Тема</Label>
							<Select
								value={selectedTopicId}
								onValueChange={(value) => {
									setSelectedTopicId(value)
									setSelectedTestId('')
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Выберите тему" />
								</SelectTrigger>
								<SelectContent>
									{(topicsData?.topics ?? []).map((topic) => (
										<SelectItem key={topic.id} value={topic.id}>
											{topic.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label>Тест</Label>
							<Select value={selectedTestId} onValueChange={setSelectedTestId} disabled={!selectedTopicId}>
								<SelectTrigger>
									<SelectValue placeholder="Выберите тест" />
								</SelectTrigger>
								<SelectContent>
									{testsForTopic.map((test) => (
										<SelectItem key={test.id} value={test.id}>
											{test.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{selectedTestId && overrideForm ? (
						<div className="space-y-3 rounded border p-3">
							<div className="space-y-1">
								<Label>Переопределенное название (опционально)</Label>
								<Input
									value={overrideForm.titleOverride}
									onChange={(e) =>
										setOverrideForm((prev) => (prev ? { ...prev, titleOverride: e.target.value } : prev))
									}
									placeholder="Если пусто, используется глобальное"
								/>
								<p className="text-xs text-muted-foreground">
									Позволяет изменить название типа только в выбранном тесте.
								</p>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>ScoringRule override</Label>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setOverrideForm((prev) =>
												prev
													? {
															...prev,
															scoringRuleOverride: prev.scoringRuleOverride
																? null
																: (globalForm.scoringRule as QuestionTypeScoringRule),
														}
													: prev
											)
										}
									>
										<RotateCcw className="mr-2 h-4 w-4" />
										{overrideForm.scoringRuleOverride ? 'Убрать scoring override' : 'Создать scoring override'}
									</Button>
								</div>
								{overrideForm.scoringRuleOverride ? (
									<QuestionTypeScoringRuleEditor
										rule={overrideForm.scoringRuleOverride}
										uiTemplate={testScopedType?.uiTemplate ?? globalForm.uiTemplate}
										onChange={(next) =>
											setOverrideForm((prev) => (prev ? { ...prev, scoringRuleOverride: next } : prev))
										}
									/>
								) : (
									<p className="text-sm text-muted-foreground">Используется глобальная формула начисления баллов.</p>
								)}
							</div>
							<div className="flex items-center justify-between rounded border p-3">
								<div>
									<p className="text-sm font-medium">Отключить тип в этом тесте</p>
									<p className="text-xs text-muted-foreground">
										Если включено, тип нельзя использовать в выбранном тесте
									</p>
								</div>
								<Switch
									checked={overrideForm.isDisabled}
									onCheckedChange={(checked) =>
										setOverrideForm((prev) => (prev ? { ...prev, isDisabled: checked } : prev))
									}
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button onClick={saveOverride} disabled={savingOverride}>
									<Save className="mr-2 h-4 w-4" />
									Сохранить override
								</Button>
								<Button variant="outline" onClick={clearOverride} disabled={savingOverride}>
									Удалить override
								</Button>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">Выберите тест, чтобы настроить override для этого типа.</p>
					)}
				</CardContent>
			</Card>
			{alertDialog}
		</div>
	)
}
