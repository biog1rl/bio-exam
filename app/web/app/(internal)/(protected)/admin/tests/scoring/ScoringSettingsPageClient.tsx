'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ArrowLeft, Loader2, Save, Settings } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { failureMessage } from '@/lib/http/errors'
import {
	adminTestsKeys,
	adminTestsListFetcher,
	saveGlobalScoringRules,
	saveTestScoringRules,
	scoringRulesFetcher,
	topicsListFetcher,
} from '@/lib/tests/admin-api'

import { QuestionTypeScoringRuleEditorFields } from '../components/QuestionTypeScoringRuleEditor'
import { TEMPLATE_META, isMetricAllowedForTemplate, type QuestionTypeDefinition } from '../types'

type Scope = 'global' | 'test'

const RULES_SWR_OPTIONS = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateOnMount: false }

function validateScoring(type: QuestionTypeDefinition): string | null {
	const rule = type.scoringRule
	if (!isMetricAllowedForTemplate(type.uiTemplate, rule.mistakeMetric)) {
		return `Тип "${type.title}": метрика ${rule.mistakeMetric} несовместима с шаблоном ${type.uiTemplate}`
	}
	if (!Number.isFinite(rule.correctPoints) || rule.correctPoints < 0) {
		return `Тип "${type.title}": неверные баллы за правильный ответ`
	}
	if (rule.formula === 'one_mistake_partial') {
		if (!Number.isFinite(rule.oneMistakePoints ?? NaN) || (rule.oneMistakePoints ?? -1) < 0) {
			return `Тип "${type.title}": неверные баллы за 1 ошибку`
		}
		if ((rule.oneMistakePoints ?? 0) > rule.correctPoints) {
			return `Тип "${type.title}": баллы за 1 ошибку не могут быть больше полного балла`
		}
	}
	if (rule.formula === 'tiers') {
		if (!rule.tiers || rule.tiers.length === 0) {
			return `Тип "${type.title}": добавьте хотя бы один tier`
		}
		for (const tier of rule.tiers) {
			if (!Number.isFinite(tier.maxMistakes) || tier.maxMistakes < 1)
				return `Тип "${type.title}": tier.maxMistakes должен быть >= 1`
			if (!Number.isFinite(tier.points) || tier.points < 0) return `Тип "${type.title}": tier.points должен быть >= 0`
			if (tier.points > rule.correctPoints) return `Тип "${type.title}": tier.points не может быть больше correctPoints`
		}
	}
	return null
}

export default function ScoringSettingsPageClient() {
	const searchParams = useSearchParams()

	const [scope, setScope] = useState<Scope>((searchParams.get('scope') as Scope) || 'global')
	const [selectedTopicId, setSelectedTopicId] = useState('')
	const [selectedTestId, setSelectedTestId] = useState('')
	const [types, setTypes] = useState<QuestionTypeDefinition[]>([])
	const [overrideEnabled, setOverrideEnabled] = useState<Record<string, boolean>>({})
	const [seededKey, setSeededKey] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [didResolveQuerySelection, setDidResolveQuerySelection] = useState(false)
	const rulesTitleRef = useRef<HTMLDivElement>(null)

	const topicsQuery = useSWR(adminTestsKeys.topics(), topicsListFetcher)
	const testsQuery = useSWR(adminTestsKeys.list(), adminTestsListFetcher)
	const topicsData = topicsQuery.data
	const testsData = testsQuery.data
	const topicsFailed = topicsQuery.error !== undefined && topicsData === undefined
	const testsFailed = testsQuery.error !== undefined && testsData === undefined
	const topics = useMemo(() => topicsData?.topics ?? [], [topicsData])
	const tests = useMemo(() => testsData?.tests ?? [], [testsData])
	const testsForTopic = useMemo(
		() => tests.filter((test) => test.topicId === selectedTopicId),
		[tests, selectedTopicId]
	)
	const selectedTest = useMemo(() => tests.find((test) => test.id === selectedTestId), [tests, selectedTestId])

	const rulesKey =
		scope === 'global'
			? adminTestsKeys.scoringGlobal()
			: selectedTestId
				? adminTestsKeys.scoringTest(selectedTestId)
				: null
	const rulesQuery = useSWR(rulesKey, scoringRulesFetcher, RULES_SWR_OPTIONS)
	const { mutate: mutateRules } = rulesQuery
	const rulesFailed = rulesQuery.error !== undefined && rulesQuery.data === undefined
	const rulesReady = rulesKey !== null && seededKey === rulesKey
	const loadingRules = rulesKey !== null && !rulesReady && !rulesFailed
	const activeRulesKeyRef = useRef(rulesKey)

	const loadRules = useCallback(
		async (key: string) => {
			const fresh = await mutateRules()
			if (!fresh || activeRulesKeyRef.current !== key) return
			setTypes(fresh.questionTypes)
			const initialOverrides: Record<string, boolean> = {}
			for (const item of fresh.questionTypes) {
				initialOverrides[item.key] = Boolean(item.hasOverride)
			}
			setOverrideEnabled(initialOverrides)
			setSeededKey(key)
		},
		[mutateRules]
	)

	useEffect(() => {
		activeRulesKeyRef.current = rulesKey
		if (rulesKey) void loadRules(rulesKey)
	}, [rulesKey, loadRules])

	useEffect(() => {
		if (didResolveQuerySelection || tests.length === 0 || topics.length === 0) return

		const queryScope = searchParams.get('scope')
		const queryTopicSlug = searchParams.get('topicSlug')
		const queryTestSlug = searchParams.get('testSlug')

		if (queryScope === 'test') setScope('test')
		if (queryTopicSlug && queryTestSlug) {
			const matched = tests.find((test) => test.topicSlug === queryTopicSlug && test.slug === queryTestSlug)
			if (matched) {
				setSelectedTopicId(matched.topicId)
				setSelectedTestId(matched.id)
			}
		}
		setDidResolveQuerySelection(true)
	}, [didResolveQuerySelection, searchParams, tests, topics])

	const handleSave = async () => {
		if (scope === 'test' && !selectedTestId) {
			toast.error('Выберите тест')
			return
		}

		for (const type of types) {
			if (scope === 'test' && !overrideEnabled[type.key]) continue
			const error = validateScoring(type)
			if (error) {
				toast.error(error)
				return
			}
		}

		setSaving(true)
		const outcome =
			scope === 'global'
				? await saveGlobalScoringRules(types.map((type) => ({ key: type.key, scoringRule: type.scoringRule })))
				: await saveTestScoringRules(
						selectedTestId,
						types.map((type) => ({
							key: type.key,
							scoringRule: type.scoringRule,
							override: Boolean(overrideEnabled[type.key]),
						}))
					)
		setSaving(false)
		if (!outcome.ok) {
			const message = outcome.message || failureMessage(outcome, 'Ошибка сохранения')
			if (message) toast.error(message)
			return
		}
		toast.success(scope === 'global' ? 'Глобальные правила сохранены' : 'Override правил для теста сохранены')
		void mutateRules()
	}

	const retryTopicsAndTests = () =>
		Promise.all([topicsFailed ? topicsQuery.mutate() : null, testsFailed ? testsQuery.mutate() : null])

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold">Настройка баллов</h1>
					<p className="text-sm text-muted-foreground">Глобально или для отдельного теста по каждому типу вопроса</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild>
						<Link href="/admin/tests">
							<ArrowLeft />К тестам
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/admin/tests/question-types">
							<Settings />
							Типы вопросов
						</Link>
					</Button>
					{selectedTest?.topicSlug ? (
						<Button variant="outline" asChild>
							<Link href={`/admin/tests/${selectedTest.topicSlug}/${selectedTest.slug}`}>Открыть тест</Link>
						</Button>
					) : null}
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Параметры</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{topicsFailed || testsFailed ? (
						<LoadErrorAlert
							title="Не удалось загрузить темы и тесты"
							error={topicsQuery.error ?? testsQuery.error}
							onRetry={retryTopicsAndTests}
						/>
					) : null}
					<div className="space-y-2">
						<Label>Режим</Label>
						<Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
							<SelectTrigger className="max-w-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="global">Глобально для всех тестов</SelectItem>
								<SelectItem value="test">Только для выбранного теста</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							В глобальном режиме вы задаете базовую формулу для всех тестов. В режиме теста можно переопределить только
							отдельные типы.
						</p>
					</div>

					{scope === 'test' ? (
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
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
										{topics.map((topic) => (
											<SelectItem key={topic.id} value={topic.id}>
												{topic.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
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
								<p className="text-xs text-muted-foreground">
									Выберите тест, чтобы включать/отключать override по каждому типу вопроса.
								</p>
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle ref={rulesTitleRef} tabIndex={-1}>
						Правила начисления
					</CardTitle>
					<Button onClick={handleSave} disabled={saving || !rulesReady}>
						{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
						Сохранить
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{rulesFailed ? (
						<LoadErrorAlert
							title="Не удалось загрузить правила"
							error={rulesQuery.error}
							onRetry={() => (rulesKey ? loadRules(rulesKey) : undefined)}
							focusTarget={rulesTitleRef}
						/>
					) : loadingRules ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Загрузка правил...
						</div>
					) : rulesKey === null ? (
						<p className="text-sm text-muted-foreground">Выберите тест, чтобы настроить override.</p>
					) : (
						<Accordion type="multiple" className="space-y-2">
							{types.map((type) => (
								<AccordionItem value={type.key} key={type.key} className="rounded-md border px-3">
									<AccordionTrigger className="hover:no-underline">
										<div className="pr-4 text-left">
											<p className="font-medium">{type.title}</p>
											<p className="text-xs text-muted-foreground">
												{type.key} | {type.uiTemplate}
												{type.isSystem ? ' | system' : ''}
											</p>
										</div>
									</AccordionTrigger>
									<AccordionContent className="space-y-3 pb-3">
										<div>
											<p className="text-xs text-muted-foreground">{TEMPLATE_META[type.uiTemplate].description}</p>
											<p className="text-xs text-muted-foreground">Пример: {TEMPLATE_META[type.uiTemplate].example}</p>
										</div>
										{scope === 'test' ? (
											<div className="flex items-center justify-between rounded-md border p-2">
												<div>
													<p className="text-sm font-medium">Override для этого теста</p>
													<p className="text-xs text-muted-foreground">
														Если выключено, используется глобальная формула.
													</p>
												</div>
												<Switch
													checked={Boolean(overrideEnabled[type.key])}
													onCheckedChange={(checked) =>
														setOverrideEnabled((prev) => ({
															...prev,
															[type.key]: checked,
														}))
													}
												/>
											</div>
										) : null}
										{scope === 'test' && !overrideEnabled[type.key] ? (
											<p className="text-sm text-muted-foreground">Используется глобальная формула для этого типа.</p>
										) : (
											<QuestionTypeScoringRuleEditorFields
												rule={type.scoringRule}
												uiTemplate={type.uiTemplate}
												onChange={(next) =>
													setTypes((prev) =>
														prev.map((item) => (item.key === type.key ? { ...item, scoringRule: next } : item))
													)
												}
											/>
										)}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
