import type { ReactNode } from 'react'

import { FolderPlus } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { NO_TOPICS_FOR_TEST, testTopicPickerState } from '@/lib/tests/bank-view'
import { transliterate } from '@/lib/utils/transliterate'

import type { TestFormData, Topic } from '../../types'
import type { TestFormSetter } from './test-editor-types'

export interface TestSettingsPanelProps {
	form: TestFormData
	setForm: TestFormSetter
	topics: Topic[]
	topicsLoading: boolean
	topicsError: boolean
	isCreateMode: boolean
	isEditingExisting: boolean
	topicSlug?: string
	testSlug?: string
	testSlugError: string | null
	setTestSlugError: (error: string | null) => void
	canManageCatalog: boolean
	onCreateTopic: () => void
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-4 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
			<h3 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">{title}</h3>
			{children}
		</section>
	)
}

function ThresholdField({
	id,
	label,
	value,
	placeholder,
	onChange,
}: {
	id: string
	label: string
	value: number | null
	placeholder: string
	onChange: (value: number | null) => void
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex gap-2">
				<Input
					id={id}
					type="number"
					min={1}
					value={value ?? ''}
					onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
					placeholder={placeholder}
					className="flex-1"
				/>
				{value !== null ? (
					<Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => onChange(null)}>
						Сброс
					</Button>
				) : null}
			</div>
		</div>
	)
}

export function TestSettingsPanel({
	form,
	setForm,
	topics,
	topicsLoading,
	topicsError,
	isCreateMode,
	isEditingExisting,
	topicSlug,
	testSlug,
	testSlugError,
	setTestSlugError,
	canManageCatalog,
	onCreateTopic,
}: TestSettingsPanelProps) {
	const topicPicker = testTopicPickerState({ topics: topics.length, canManage: canManageCatalog })
	return (
		<div className="space-y-5">
			<FieldGroup title="Основное">
				<div className="space-y-2">
					<Label>Тема</Label>
					{topicsLoading ? (
						<Skeleton className="h-10 w-full" aria-label="Загрузка тем" />
					) : topicsError ? (
						<p role="alert">Не удалось загрузить темы</p>
					) : topicPicker === 'ask-admin' ? (
						<p className="text-sm text-muted-foreground">{NO_TOPICS_FOR_TEST}</p>
					) : topicPicker === 'create-first' ? (
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">Нет доступных тем. Создайте первую тему.</p>
							<Button type="button" variant="outline" className="w-full rounded-full" onClick={onCreateTopic}>
								<FolderPlus className="mr-2 size-4" />
								Создать тему
							</Button>
						</div>
					) : (
						<div className="flex gap-2">
							<Select value={form.topicId} onValueChange={(v) => setForm({ ...form, topicId: v })}>
								<SelectTrigger className="min-w-0 flex-1">
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
							{canManageCatalog ? (
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={onCreateTopic}
									aria-label="Создать тему"
									title="Создать тему"
								>
									<FolderPlus className="size-4" />
								</Button>
							) : null}
						</div>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="test-settings-title">Название</Label>
					<Input
						id="test-settings-title"
						value={form.title}
						onChange={(e) => {
							const title = e.target.value
							setForm({
								...form,
								title,
								slug: isCreateMode ? transliterate(title) : form.slug,
							})
						}}
						placeholder="Тест по теме..."
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="test-settings-slug">Адрес (slug)</Label>
					<Input
						id="test-settings-slug"
						value={form.slug}
						onChange={(e) => {
							const slug = e.target.value
							const err =
								!slug || slug.length < 2 || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)
									? 'Только латинские буквы, цифры и дефисы (2-100 символов)'
									: null
							setTestSlugError(err)
							setForm({ ...form, slug })
						}}
						placeholder="test-slug"
						className={testSlugError ? 'border-destructive focus-visible:ring-destructive' : ''}
					/>
					{testSlugError ? (
						<p className="text-xs text-destructive">{testSlugError}</p>
					) : (
						<p className="text-xs text-muted-foreground">Только латинские буквы, цифры и дефисы</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="test-settings-description">Описание</Label>
					<Textarea
						id="test-settings-description"
						value={form.description}
						onChange={(e) => setForm({ ...form, description: e.target.value })}
						placeholder="Описание теста..."
						rows={3}
					/>
				</div>
			</FieldGroup>

			<FieldGroup title="Прохождение">
				<div className="space-y-2">
					<Label htmlFor="test-settings-time">Лимит времени, минут</Label>
					<Input
						id="test-settings-time"
						type="number"
						min={0}
						value={form.timeLimitMinutes || ''}
						onChange={(e) =>
							setForm({
								...form,
								timeLimitMinutes: e.target.value ? parseInt(e.target.value) : null,
							})
						}
						placeholder="Без лимита"
					/>
					{(form.timeLimitMinutes ?? 0) > 60 && (
						<p className="text-xs text-muted-foreground">
							{Math.floor(form.timeLimitMinutes! / 60)} ч{' '}
							{form.timeLimitMinutes! % 60 > 0 ? `${form.timeLimitMinutes! % 60} мин` : ''}
						</p>
					)}
				</div>

				{form.timeLimitMinutes ? (
					<>
						<ThresholdField
							id="test-settings-red"
							label="Красный таймер, минут до конца"
							value={form.redThresholdMinutes}
							placeholder="Глобальный (5 мин)"
							onChange={(redThresholdMinutes) => setForm({ ...form, redThresholdMinutes })}
						/>
						<ThresholdField
							id="test-settings-warning"
							label="Предупреждение, минут до конца"
							value={form.warningThresholdMinutes}
							placeholder="Глобальный (1 мин)"
							onChange={(warningThresholdMinutes) => setForm({ ...form, warningThresholdMinutes })}
						/>
					</>
				) : null}

				<div className="space-y-2">
					<Label htmlFor="test-settings-passing">Проходной балл, %</Label>
					<Input
						id="test-settings-passing"
						type="number"
						min={0}
						max={100}
						value={form.passingScore || ''}
						onChange={(e) =>
							setForm({
								...form,
								passingScore: e.target.value ? parseFloat(e.target.value) : null,
							})
						}
						placeholder="Не задан"
					/>
				</div>

				<div className="flex items-center justify-between gap-4">
					<Label htmlFor="test-settings-show-answer">Показывать правильный ответ после проверки</Label>
					<Switch
						id="test-settings-show-answer"
						checked={form.showCorrectAnswer}
						onCheckedChange={(checked) => setForm({ ...form, showCorrectAnswer: checked })}
					/>
				</div>
			</FieldGroup>

			{canManageCatalog ? (
				<FieldGroup title="Начисление баллов">
					{isEditingExisting && topicSlug && testSlug ? (
						<div className="flex flex-col gap-2">
							<Button variant="outline" asChild className="rounded-full">
								<Link href={`/admin/tests/scoring?scope=test&topicSlug=${topicSlug}&testSlug=${testSlug}`}>
									Настроить баллы для этого теста
								</Link>
							</Button>
							<Button variant="outline" asChild className="rounded-full">
								<Link href="/admin/tests/question-types">Настроить типы вопросов</Link>
							</Button>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">Сохраните тест, чтобы настроить баллы для него отдельно.</p>
					)}
				</FieldGroup>
			) : null}

			{isCreateMode && form.isPublished && form.questions.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Первое сохранение создаст черновик. Опубликовать тест можно после добавления хотя бы одного вопроса.
				</p>
			) : null}
		</div>
	)
}
