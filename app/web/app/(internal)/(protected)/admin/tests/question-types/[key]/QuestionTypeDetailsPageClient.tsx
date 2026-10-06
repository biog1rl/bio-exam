'use client'

import { AUTO_SCORED_TEMPLATES, isAutoScoredTemplate } from '@bio-exam/exam-core'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Save } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { failureMessage } from '@/lib/http/errors'
import {
	adminTestsKeys,
	adminTestsListFetcher,
	deleteTestQuestionTypeOverride,
	questionTypeFetcher,
	questionTypesFetcher,
	saveQuestionType,
	saveTestQuestionTypeOverride,
	topicsListFetcher,
} from '@/lib/tests/admin-api'

import { QuestionTypeScoringRuleEditorFields } from '../../components/QuestionTypeScoringRuleEditor'
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

type TestForm = { titleOverride: string; isDisabled: boolean }

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

function NumberField({
	id,
	label,
	hint,
	value,
	onChange,
}: {
	id: string
	label: string
	hint: string
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="space-y-1">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="number"
				min={0}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="Не задано"
			/>
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	)
}

function SwitchRow({
	id,
	title,
	hint,
	checked,
	disabled,
	onCheckedChange,
}: {
	id: string
	title: string
	hint: string
	checked: boolean
	disabled?: boolean
	onCheckedChange: (checked: boolean) => void
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-3 py-2">
			<Label htmlFor={id} className={disabled ? 'block' : 'block cursor-pointer'}>
				<span className="block text-sm font-medium text-foreground">{title}</span>
				<span className="block text-xs font-normal text-muted-foreground">{hint}</span>
			</Label>
			<Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
		</div>
	)
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	return (
		<section className="space-y-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-6">
			<div>
				<h2 className="text-base font-semibold text-foreground">{title}</h2>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{children}
		</section>
	)
}

export default function QuestionTypeDetailsPageClient({ typeKey }: { typeKey: string }) {
	const { confirm, alertDialog } = useUiAlertDialog()
	const [savingGlobal, setSavingGlobal] = useState(false)
	const [savingTest, setSavingTest] = useState(false)
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
	const selectedTest = useMemo(
		() => (testsData?.tests ?? []).find((test) => test.id === selectedTestId) ?? null,
		[testsData?.tests, selectedTestId]
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
	const [testForm, setTestForm] = useState<TestForm | null>(null)
	const activeTypeKeyRef = useRef(typeKey)

	const breadcrumbLabels = useMemo(() => {
		const title = typeData?.questionType?.title
		return title ? { [`/admin/tests/question-types/${typeKey}`]: title } : {}
	}, [typeData?.questionType?.title, typeKey])

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

	useEffect(() => {
		if (!testScopedType) return
		setTestForm({
			titleOverride: testScopedType.override?.titleOverride || '',
			isDisabled: Boolean(testScopedType.override?.isDisabled),
		})
	}, [testScopedType])

	const savedFormula = testScopedType?.override?.scoringRuleOverride ?? null
	const hasTestSettings = Boolean(testScopedType?.override)

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
		toast.success('Тип вопроса сохранён')
		await loadType(typeKey)
		await mutateTestScoped()
		setSavingGlobal(false)
	}

	const saveForTest = async () => {
		if (!selectedTestId || !testForm) return
		const titleOverride = testForm.titleOverride.trim() || null
		setSavingTest(true)
		const outcome =
			!titleOverride && !testForm.isDisabled && !savedFormula
				? hasTestSettings
					? await deleteTestQuestionTypeOverride(selectedTestId, typeKey)
					: { ok: true as const, status: 204, data: null }
				: await saveTestQuestionTypeOverride(selectedTestId, typeKey, {
						titleOverride,
						scoringRuleOverride: savedFormula,
						isDisabled: testForm.isDisabled,
					})
		setSavingTest(false)
		if (!outcome.ok) {
			toastFailure(outcome, 'Не удалось сохранить настройки типа для теста')
			return
		}
		toast.success('Настройки типа для теста сохранены')
		await mutateTestScoped()
	}

	const resetForTest = async () => {
		if (!selectedTestId) return
		const confirmed = await confirm({
			title: 'Сбросить название и отключение для теста?',
			description: savedFormula
				? 'Своя формула баллов для теста останется — её можно убрать в настройке баллов.'
				: 'В тесте снова будут действовать общие настройки типа.',
			confirmText: 'Сбросить',
			cancelText: 'Отмена',
		})
		if (!confirmed) return
		setSavingTest(true)
		const outcome = savedFormula
			? await saveTestQuestionTypeOverride(selectedTestId, typeKey, {
					titleOverride: null,
					scoringRuleOverride: savedFormula,
					isDisabled: false,
				})
			: await deleteTestQuestionTypeOverride(selectedTestId, typeKey)
		setSavingTest(false)
		if (!outcome.ok) {
			toastFailure(outcome, 'Не удалось сбросить настройки типа для теста')
			return
		}
		toast.success('Настройки типа для теста сброшены')
		await mutateTestScoped()
	}

	if (typeLoading || !globalForm || !typeData?.questionType) {
		return (
			<div className="space-y-4">
				<SetBreadcrumbsLabels labels={breadcrumbLabels} />
				{typeLoadFailed ? (
					<LoadErrorAlert
						title="Не удалось загрузить тип вопроса"
						error={typeError}
						onRetry={() => loadType(typeKey)}
					/>
				) : (
					<Skeleton className="h-96 rounded-3xl" aria-label="Загрузка типа вопроса" />
				)}
			</div>
		)
	}

	const questionType = typeData.questionType
	const isOpenType = !isAutoScoredTemplate(questionType.uiTemplate)
	const templateOptions = isOpenType ? [questionType.uiTemplate] : AUTO_SCORED_TEMPLATES
	const scoringHref = selectedTest
		? `/admin/tests/scoring?scope=test&topicSlug=${selectedTest.topicSlug}&testSlug=${selectedTest.slug}&type=${typeKey}`
		: `/admin/tests/scoring?type=${typeKey}`

	return (
		<div className="space-y-4">
			<SetBreadcrumbsLabels labels={breadcrumbLabels} />
			<PageHeader
				title={questionType.title}
				meta={
					<div className="flex flex-wrap items-center gap-1.5">
						<span>Формат ответа: {TEMPLATE_META[questionType.uiTemplate].label}</span>
						{questionType.isSystem ? (
							<Badge variant="outline" className="rounded-full">
								Системный
							</Badge>
						) : null}
						{questionType.isActive ? null : (
							<Badge variant="secondary" className="rounded-full">
								Отключён
							</Badge>
						)}
					</div>
				}
			>
				<Button className="h-10 shrink-0 rounded-full" onClick={saveGlobal} disabled={savingGlobal}>
					<Save className="size-4" aria-hidden="true" />
					Сохранить тип
				</Button>
			</PageHeader>

			<Section title="Основное">
				<div className="grid gap-4 tab-sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="type-title">Название</Label>
						<Input
							id="type-title"
							value={globalForm.title}
							onChange={(e) => setGlobalForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
						/>
						<p className="text-xs text-muted-foreground">Так тип называется при выборе в вопросе.</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor="type-template">Формат ответа</Label>
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
							disabled={questionType.isSystem}
						>
							<SelectTrigger id="type-template" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{templateOptions.map((template) => (
									<SelectItem key={template} value={template}>
										{TEMPLATE_META[template].label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{questionType.isSystem
								? 'У системного типа формат не меняется.'
								: TEMPLATE_META[globalForm.uiTemplate].description}
						</p>
					</div>
				</div>
				<div className="space-y-1">
					<Label htmlFor="type-description">Описание</Label>
					<Textarea
						id="type-description"
						value={globalForm.description}
						onChange={(e) => setGlobalForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
						rows={2}
					/>
					<p className="text-xs text-muted-foreground">Подсказка для того, кто составляет вопросы.</p>
				</div>
				<div className="grid gap-4 tab-sm:grid-cols-3">
					<NumberField
						id="type-min-options"
						label="Вариантов не меньше"
						hint="Сколько вариантов ответа должно быть минимум."
						value={globalForm.validationMinOptions}
						onChange={(value) => setGlobalForm((prev) => (prev ? { ...prev, validationMinOptions: value } : prev))}
					/>
					<NumberField
						id="type-max-options"
						label="Вариантов не больше"
						hint="Сколько вариантов ответа может быть максимум."
						value={globalForm.validationMaxOptions}
						onChange={(value) => setGlobalForm((prev) => (prev ? { ...prev, validationMaxOptions: value } : prev))}
					/>
					<NumberField
						id="type-exact-choices"
						label="Верных ответов ровно"
						hint="Например, 3 для заданий «выберите три ответа»."
						value={globalForm.validationExactChoiceCount}
						onChange={(value) =>
							setGlobalForm((prev) => (prev ? { ...prev, validationExactChoiceCount: value } : prev))
						}
					/>
				</div>
				<SwitchRow
					id="type-active"
					title="Тип доступен"
					hint={
						isOpenType ? 'Открытые вопросы пока недоступны.' : 'Если выключить, тип нельзя выбрать в новых вопросах.'
					}
					checked={globalForm.isActive}
					disabled={isOpenType}
					onCheckedChange={(checked) => setGlobalForm((prev) => (prev ? { ...prev, isActive: checked } : prev))}
				/>
			</Section>

			<Section
				title="Общая формула баллов"
				description={
					<>
						Действует во всех тестах. Все формулы сразу и свои формулы для отдельных тестов — в{' '}
						<Link
							href={`/admin/tests/scoring?type=${typeKey}`}
							className="font-medium text-primary underline-offset-4 hover:underline"
						>
							настройке баллов
						</Link>
						.
					</>
				}
			>
				{isOpenType ? (
					<p className="text-sm text-muted-foreground">Баллы за открытый вопрос выставляет учитель: от 0 до 3.</p>
				) : (
					<QuestionTypeScoringRuleEditorFields
						rule={globalForm.scoringRule}
						uiTemplate={globalForm.uiTemplate}
						onChange={(next) => setGlobalForm((prev) => (prev ? { ...prev, scoringRule: next } : prev))}
					/>
				)}
			</Section>

			<Section title="Для отдельного теста" description="Своё название типа или отключение только в выбранном тесте.">
				<div className="grid gap-4 tab-sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="type-test-topic">Тема</Label>
						<Select
							value={selectedTopicId}
							onValueChange={(value) => {
								setSelectedTopicId(value)
								setSelectedTestId('')
								setTestForm(null)
							}}
						>
							<SelectTrigger id="type-test-topic" className="w-full">
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
						<Label htmlFor="type-test-test">Тест</Label>
						<Select
							value={selectedTestId}
							onValueChange={(value) => {
								setSelectedTestId(value)
								setTestForm(null)
							}}
							disabled={!selectedTopicId}
						>
							<SelectTrigger id="type-test-test" className="w-full">
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

				{selectedTestId && testForm ? (
					<div className="space-y-4">
						<div className="space-y-1">
							<Label htmlFor="type-test-title">Название в этом тесте</Label>
							<Input
								id="type-test-title"
								value={testForm.titleOverride}
								onChange={(e) => setTestForm((prev) => (prev ? { ...prev, titleOverride: e.target.value } : prev))}
								placeholder={`Как везде: ${questionType.title}`}
							/>
						</div>
						<SwitchRow
							id="type-test-disabled"
							title="Отключить в этом тесте"
							hint="Тип нельзя будет выбрать в вопросах этого теста."
							checked={testForm.isDisabled}
							onCheckedChange={(checked) => setTestForm((prev) => (prev ? { ...prev, isDisabled: checked } : prev))}
						/>
						<p className="text-sm text-muted-foreground">
							Формула в этом тесте: {savedFormula ? 'своя' : 'общая'}.{' '}
							<Link href={scoringHref} className="font-medium text-primary underline-offset-4 hover:underline">
								Изменить формулу для теста
							</Link>
						</p>
						<div className="flex flex-wrap gap-2">
							<Button className="rounded-full" onClick={saveForTest} disabled={savingTest}>
								<Save className="size-4" aria-hidden="true" />
								Сохранить для теста
							</Button>
							{hasTestSettings ? (
								<Button variant="outline" className="rounded-full" onClick={resetForTest} disabled={savingTest}>
									Сбросить
								</Button>
							) : null}
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">Выберите тему и тест.</p>
				)}
			</Section>
			{alertDialog}
		</div>
	)
}
