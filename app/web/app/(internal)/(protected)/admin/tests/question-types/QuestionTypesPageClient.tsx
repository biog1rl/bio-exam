'use client'

import { QUESTION_UI_TEMPLATES } from '@bio-exam/exam-core'

import { useMemo, useRef, useState } from 'react'

import { Plus, Settings } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useRowLink } from '@/components/table/use-row-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { failureMessage } from '@/lib/http/errors'
import { adminTestsKeys, questionTypesFetcher, saveQuestionType } from '@/lib/tests/admin-api'
import { cn } from '@/lib/utils/cn'

import QuestionTypeScoringRuleEditor from '../components/QuestionTypeScoringRuleEditor'
import {
	TEMPLATE_META,
	createDefaultQuestionTypeScoringRule,
	type QuestionTypeScoringRule,
	type QuestionUiTemplate,
} from '../types'

type CreateState = {
	key: string
	title: string
	description: string
	uiTemplate: QuestionUiTemplate
	isActive: boolean
	validationMinOptions: string
	validationMaxOptions: string
	validationExactChoiceCount: string
	scoringRule: QuestionTypeScoringRule
}

function createInitialState(): CreateState {
	return {
		key: '',
		title: '',
		description: '',
		uiTemplate: 'short_text',
		isActive: true,
		validationMinOptions: '',
		validationMaxOptions: '',
		validationExactChoiceCount: '',
		scoringRule: createDefaultQuestionTypeScoringRule('short_text'),
	}
}

export default function QuestionTypesPageClient() {
	const [dialogOpen, setDialogOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [form, setForm] = useState<CreateState>(createInitialState())

	const titleRef = useRef<HTMLHeadingElement>(null)

	const { data, error, mutate, isLoading } = useSWR(
		adminTestsKeys.questionTypes({ includeInactive: true }),
		questionTypesFetcher
	)
	const types = useMemo(() => data?.questionTypes ?? [], [data])
	const rowLink = useRowLink()
	const loadFailed = error !== undefined && data === undefined

	const handleCreate = async () => {
		if (!form.key.trim() || !form.title.trim()) {
			toast.error('Заполните код типа и название')
			return
		}
		setSaving(true)
		const validationSchema =
			form.validationMinOptions || form.validationMaxOptions || form.validationExactChoiceCount
				? {
						minOptions: form.validationMinOptions ? Number(form.validationMinOptions) : undefined,
						maxOptions: form.validationMaxOptions ? Number(form.validationMaxOptions) : undefined,
						exactChoiceCount: form.validationExactChoiceCount ? Number(form.validationExactChoiceCount) : undefined,
					}
				: null
		const outcome = await saveQuestionType({
			body: {
				key: form.key.trim(),
				title: form.title.trim(),
				description: form.description.trim() || null,
				uiTemplate: form.uiTemplate,
				validationSchema,
				scoringRule: form.scoringRule,
				isActive: form.isActive,
			},
		})
		setSaving(false)
		if (!outcome.ok) {
			const message = failureMessage(outcome, 'Не удалось создать тип')
			if (message) toast.error(message)
			return
		}
		toast.success('Тип вопроса создан')
		setDialogOpen(false)
		setForm(createInitialState())
		await mutate()
	}

	return (
		<div className="space-y-5">
			<section className="flex flex-col gap-4 rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:flex-row tab-sm:items-start tab-sm:justify-between tab-sm:p-unit">
				<div className="min-w-0">
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">банк заданий</p>
					<h1
						ref={titleRef}
						tabIndex={-1}
						className="mt-2 font-serif text-3xl leading-tight text-foreground tab-sm:text-4xl"
					>
						Типы вопросов
					</h1>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Шаблон ответа, проверка вариантов и формула баллов для каждого типа. Баллы для отдельного теста — в{' '}
						<Link href="/admin/tests/scoring" className="font-medium text-primary underline-offset-4 hover:underline">
							настройке баллов
						</Link>
						.
					</p>
				</div>
				<Button className="shrink-0 rounded-full" onClick={() => setDialogOpen(true)}>
					<Plus className="size-4" aria-hidden="true" />
					Новый тип
				</Button>
			</section>

			{loadFailed ? (
				<LoadErrorAlert
					title="Не удалось загрузить типы вопросов"
					error={error}
					onRetry={() => mutate()}
					focusTarget={titleRef}
				/>
			) : isLoading ? (
				<Skeleton className="h-72 rounded-3xl" aria-label="Загрузка типов вопросов" />
			) : (
				<div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="pl-4">Тип</TableHead>
								<TableHead className="hidden w-48 tab-sm:table-cell">Шаблон ответа</TableHead>
								<TableHead className="hidden w-44 tab:table-cell">Код</TableHead>
								<TableHead className="hidden w-52 mob:table-cell">Статус</TableHead>
								<TableHead className="w-14 pr-3">
									<span className="sr-only">Настроить</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{types.map((item) => {
								const href = `/admin/tests/question-types/${item.key}`
								const template = TEMPLATE_META[item.uiTemplate]?.label ?? item.uiTemplate
								return (
									<TableRow key={item.key} className="cursor-pointer" {...rowLink(href)}>
										<TableCell className="py-3 pl-4">
											<Link
												href={href}
												className={cn(
													'font-medium [overflow-wrap:anywhere] transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none',
													item.isActive ? 'text-foreground' : 'text-muted-foreground'
												)}
											>
												{item.title}
											</Link>
											{item.description ? (
												<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
											) : null}
											<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">
												{template}
												<span className="mob:hidden"> · {item.isActive ? 'активен' : 'отключён'}</span>
											</p>
										</TableCell>
										<TableCell className="hidden text-muted-foreground tab-sm:table-cell">{template}</TableCell>
										<TableCell className="hidden truncate font-mono text-xs text-muted-foreground tab:table-cell">
											{item.key}
										</TableCell>
										<TableCell className="hidden mob:table-cell">
											<span className="flex flex-wrap gap-1">
												<Badge variant={item.isActive ? 'default' : 'secondary'} className="rounded-full">
													{item.isActive ? 'Активен' : 'Отключён'}
												</Badge>
												{item.isSystem ? (
													<Badge variant="outline" className="rounded-full">
														Системный
													</Badge>
												) : null}
											</span>
										</TableCell>
										<TableCell className="pr-3">
											<Button
												asChild
												size="icon"
												variant="ghost"
												className="size-8 rounded-full"
												aria-label={`Настроить тип ${item.title}`}
											>
												<Link href={href}>
													<Settings className="size-4" aria-hidden="true" />
												</Link>
											</Button>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Новый тип вопроса</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid gap-3 tab-sm:grid-cols-2">
							<div className="space-y-1">
								<Label htmlFor="new-type-key">Код типа</Label>
								<Input
									id="new-type-key"
									value={form.key}
									onChange={(e) =>
										setForm((prev) => ({
											...prev,
											key: e.target.value
												.trim()
												.toLowerCase()
												.replace(/[^a-z0-9_]/g, ''),
										}))
									}
									placeholder="kratkiy_otvet_3"
								/>
								<p className="text-xs text-muted-foreground">
									Латинские буквы, цифры и подчёркивание. После создания не меняется.
								</p>
							</div>
							<div className="space-y-1">
								<Label htmlFor="new-type-title">Название</Label>
								<Input
									id="new-type-title"
									value={form.title}
									onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
								/>
								<p className="text-xs text-muted-foreground">Так тип называется при выборе в вопросе.</p>
							</div>
						</div>
						<div className="space-y-1">
							<Label htmlFor="new-type-description">Описание</Label>
							<Textarea
								id="new-type-description"
								value={form.description}
								onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
								rows={2}
							/>
							<p className="text-xs text-muted-foreground">Подсказка для того, кто составляет вопросы.</p>
						</div>
						<div className="grid gap-3 tab-sm:grid-cols-2">
							<div className="space-y-1">
								<Label htmlFor="new-type-template">Формат ответа</Label>
								<Select
									value={form.uiTemplate}
									onValueChange={(value) =>
										setForm((prev) => ({
											...prev,
											uiTemplate: value as QuestionUiTemplate,
											scoringRule: createDefaultQuestionTypeScoringRule(value as QuestionUiTemplate),
										}))
									}
								>
									<SelectTrigger id="new-type-template" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{QUESTION_UI_TEMPLATES.map((template) => (
											<SelectItem key={template} value={template}>
												{TEMPLATE_META[template].label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">{TEMPLATE_META[form.uiTemplate].description}</p>
							</div>
							<div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-3 py-2">
								<Label htmlFor="new-type-active" className="block cursor-pointer">
									<span className="block text-sm font-medium text-foreground">Тип доступен</span>
									<span className="block text-xs font-normal text-muted-foreground">
										Если выключить, тип нельзя выбрать в новых вопросах.
									</span>
								</Label>
								<Switch
									id="new-type-active"
									checked={form.isActive}
									onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium text-foreground">Ограничения вариантов (необязательно)</p>
							<div className="grid gap-3 tab-sm:grid-cols-3">
								<div className="space-y-1">
									<Label htmlFor="new-type-min">Вариантов не меньше</Label>
									<Input
										id="new-type-min"
										type="number"
										min={0}
										value={form.validationMinOptions}
										onChange={(e) => setForm((prev) => ({ ...prev, validationMinOptions: e.target.value }))}
									/>
									<p className="text-xs text-muted-foreground">Сколько вариантов ответа должно быть минимум.</p>
								</div>
								<div className="space-y-1">
									<Label htmlFor="new-type-max">Вариантов не больше</Label>
									<Input
										id="new-type-max"
										type="number"
										min={0}
										value={form.validationMaxOptions}
										onChange={(e) => setForm((prev) => ({ ...prev, validationMaxOptions: e.target.value }))}
									/>
									<p className="text-xs text-muted-foreground">Сколько вариантов ответа может быть максимум.</p>
								</div>
								<div className="space-y-1">
									<Label htmlFor="new-type-exact">Верных ответов ровно</Label>
									<Input
										id="new-type-exact"
										type="number"
										min={0}
										value={form.validationExactChoiceCount}
										onChange={(e) => setForm((prev) => ({ ...prev, validationExactChoiceCount: e.target.value }))}
									/>
									<p className="text-xs text-muted-foreground">Например, 3 для заданий «выберите три ответа».</p>
								</div>
							</div>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium text-foreground">Формула баллов</p>
							<QuestionTypeScoringRuleEditor
								rule={form.scoringRule}
								uiTemplate={form.uiTemplate}
								onlyFields
								onChange={(next) => setForm((prev) => ({ ...prev, scoringRule: next }))}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Отмена
						</Button>
						<Button onClick={handleCreate} disabled={saving}>
							{saving ? 'Сохранение...' : 'Создать тип'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
