'use client'

import { useMemo, useState } from 'react'

import { ArrowLeft, Plus, Settings } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import useSWR from 'swr'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-fetch'

import QuestionTypeScoringRuleEditor from '../components/QuestionTypeScoringRuleEditor'
import {
	TEMPLATE_META,
	createDefaultQuestionTypeScoringRule,
	type QuestionTypeScoringRule,
	type QuestionTypesResponse,
	type QuestionUiTemplate,
} from '../types'

const fetcher = async (url: string) => {
	const res = await fetch(url, { credentials: 'include' })
	if (!res.ok) {
		const data = await res.json().catch(() => null)
		throw new Error(data?.error || 'Ошибка загрузки')
	}
	return (await res.json()) as QuestionTypesResponse
}

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

	const { data, mutate, isLoading } = useSWR<QuestionTypesResponse>(
		'/api/tests/question-types?includeInactive=true',
		fetcher
	)
	const types = useMemo(() => data?.questionTypes ?? [], [data])

	const handleCreate = async () => {
		if (!form.key.trim() || !form.title.trim()) {
			toast.error('Заполните key и название')
			return
		}
		setSaving(true)
		try {
			const validationSchema =
				form.validationMinOptions || form.validationMaxOptions || form.validationExactChoiceCount
					? {
							minOptions: form.validationMinOptions ? Number(form.validationMinOptions) : undefined,
							maxOptions: form.validationMaxOptions ? Number(form.validationMaxOptions) : undefined,
							exactChoiceCount: form.validationExactChoiceCount ? Number(form.validationExactChoiceCount) : undefined,
						}
					: null
			const payload = {
				key: form.key.trim(),
				title: form.title.trim(),
				description: form.description.trim() || null,
				uiTemplate: form.uiTemplate,
				validationSchema,
				scoringRule: form.scoringRule,
				isActive: form.isActive,
			}
			const res = await apiFetch('/api/tests/question-types', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => null)
				throw new Error(data?.error || 'Не удалось создать тип')
			}
			toast.success('Тип вопроса создан')
			setDialogOpen(false)
			setForm(createInitialState())
			await mutate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка сохранения')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">Типы вопросов</h1>
					<p className="text-muted-foreground text-sm">Настройка шаблонов, названий и формул начисления баллов</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild>
						<Link href="/admin/tests">
							<ArrowLeft className="mr-2 h-4 w-4" />К тестам
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/admin/tests/scoring">
							<Settings className="mr-2 h-4 w-4" />К настройке баллов
						</Link>
					</Button>
					<Button onClick={() => setDialogOpen(true)}>
						<Plus className="mr-2 h-4 w-4" />
						Новый тип
					</Button>
				</div>
			</div>

			{isLoading ? (
				<Card>
					<CardContent className="py-8 text-sm">Загрузка...</CardContent>
				</Card>
			) : (
				<div className="grid gap-3">
					{types.map((item) => (
						<Card key={item.key}>
							<CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
								<div className="space-y-1">
									<p className="font-medium">{item.title}</p>
									<p className="text-muted-foreground text-xs">
										`{item.key}` • {item.uiTemplate}
										{item.isSystem ? ' • system' : ''}
										{item.isActive ? '' : ' • disabled'}
									</p>
									{item.description ? <p className="text-muted-foreground text-sm">{item.description}</p> : null}
								</div>
								<Button variant="outline" asChild>
									<Link href={`/admin/tests/question-types/${item.key}`}>
										<Settings className="mr-2 h-4 w-4" />
										Настроить
									</Link>
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Новый тип вопроса</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="grid gap-3 md:grid-cols-2">
							<div className="space-y-1">
								<Label>Ключ</Label>
								<Input
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
									placeholder="my_custom_type"
								/>
								<p className="text-muted-foreground text-xs">
									Технический id типа. Используются только `a-z`, `0-9`, `_`. После создания лучше не менять.
								</p>
							</div>
							<div className="space-y-1">
								<Label>Название</Label>
								<Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
								<p className="text-muted-foreground text-xs">
									Отображаемое название в редакторе и на страницах настройки.
								</p>
							</div>
						</div>
						<div className="space-y-1">
							<Label>Описание</Label>
							<Textarea
								value={form.description}
								onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
								rows={2}
							/>
							<p className="text-muted-foreground text-xs">
								Кратко опишите, как должен отвечать пользователь в этом типе.
							</p>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<div className="space-y-1">
								<Label>UI шаблон</Label>
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
								<p className="text-muted-foreground text-xs">
									Шаблон определяет формат ответа и доступные метрики ошибок для этого типа.
								</p>
							</div>
							<div className="flex items-center justify-between rounded border p-3">
								<div>
									<p className="text-sm font-medium">Активен</p>
									<p className="text-muted-foreground text-xs">
										Если выключено, тип скрывается в выборе для новых вопросов
									</p>
								</div>
								<Switch
									checked={form.isActive}
									onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
								/>
							</div>
						</div>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Памятка по шаблону</CardTitle>
							</CardHeader>
							<CardContent className="space-y-1 text-sm">
								<p className="font-medium">{TEMPLATE_META[form.uiTemplate].label}</p>
								<p className="text-muted-foreground">{TEMPLATE_META[form.uiTemplate].description}</p>
								<p className="text-muted-foreground">Формат ответа: {TEMPLATE_META[form.uiTemplate].answerFormat}</p>
								<p className="text-muted-foreground">Пример: {TEMPLATE_META[form.uiTemplate].example}</p>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Валидация (опционально)</CardTitle>
								<CardDescription>Дополнительные ограничения для данного типа</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-3 md:grid-cols-3">
								<div className="space-y-1">
									<Label>minOptions</Label>
									<Input
										type="number"
										min={0}
										value={form.validationMinOptions}
										onChange={(e) => setForm((prev) => ({ ...prev, validationMinOptions: e.target.value }))}
									/>
									<p className="text-muted-foreground text-xs">Минимум вариантов ответа (для choice-шаблонов).</p>
								</div>
								<div className="space-y-1">
									<Label>maxOptions</Label>
									<Input
										type="number"
										min={0}
										value={form.validationMaxOptions}
										onChange={(e) => setForm((prev) => ({ ...prev, validationMaxOptions: e.target.value }))}
									/>
									<p className="text-muted-foreground text-xs">Максимум вариантов ответа.</p>
								</div>
								<div className="space-y-1">
									<Label>exactChoiceCount</Label>
									<Input
										type="number"
										min={0}
										value={form.validationExactChoiceCount}
										onChange={(e) => setForm((prev) => ({ ...prev, validationExactChoiceCount: e.target.value }))}
									/>
									<p className="text-muted-foreground text-xs">
										Требует фиксированное количество выбранных вариантов. Пример: `3 из 6`.
									</p>
								</div>
							</CardContent>
						</Card>
						<div className="space-y-2">
							<Label>Формула начисления баллов</Label>
							<QuestionTypeScoringRuleEditor
								rule={form.scoringRule}
								uiTemplate={form.uiTemplate}
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
