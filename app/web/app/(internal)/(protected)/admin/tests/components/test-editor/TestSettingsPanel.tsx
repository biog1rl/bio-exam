import { FolderPlus, Loader2, Save } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { transliterate } from '@/lib/utils/transliterate'

import type { TestFormData, Topic } from '../../types'
import { AdminTestsSectionCard } from '../AdminTestsSectionCard'
import type { TestFormSetter } from './test-editor-types'

interface TestSettingsPanelProps {
	form: TestFormData
	setForm: TestFormSetter
	topics: Topic[]
	isCreateMode: boolean
	isEditingExisting: boolean
	topicSlug?: string
	testSlug?: string
	testSlugError: string | null
	setTestSlugError: (error: string | null) => void
	saving: boolean
	onCreateTopic: () => void
	onSave: () => void
}

export function TestSettingsPanel({
	form,
	setForm,
	topics,
	isCreateMode,
	isEditingExisting,
	topicSlug,
	testSlug,
	testSlugError,
	setTestSlugError,
	saving,
	onCreateTopic,
	onSave,
}: TestSettingsPanelProps) {
	return (
		<AdminTestsSectionCard
			title="Настройки теста"
			className="top-unit tab:max-h-[calc(100dvh-22rem)] sticky h-fit"
			headerClassName="pb-3"
		>
			<div className="space-y-4 pr-3">
				<ScrollArea>
					<div className="space-y-2">
						<Label>Тема</Label>
						{topics.length === 0 ? (
							<div className="space-y-2">
								<p className="text-muted-foreground text-sm">Нет доступных тем. Создайте первую тему.</p>
								<Button type="button" variant="outline" className="w-full rounded-full" onClick={onCreateTopic}>
									<FolderPlus className="mr-2 size-4" />
									Создать тему
								</Button>
							</div>
						) : (
							<div className="flex gap-2">
								<Select value={form.topicId} onValueChange={(v) => setForm({ ...form, topicId: v })}>
									<SelectTrigger className="flex-1">
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
								<Button type="button" variant="outline" size="icon" onClick={onCreateTopic} title="Создать тему">
									<FolderPlus className="size-4" />
								</Button>
							</div>
						)}
					</div>

					<div className="space-y-2">
						<Label>Название</Label>
						<Input
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
						<Label>Slug (URL)</Label>
						<Input
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
							<p className="text-destructive text-xs">{testSlugError}</p>
						) : (
							<p className="text-muted-foreground text-xs">Только латинские буквы, цифры и дефисы</p>
						)}
					</div>

					<div className="space-y-2">
						<Label>Описание</Label>
						<Textarea
							value={form.description}
							onChange={(e) => setForm({ ...form, description: e.target.value })}
							placeholder="Описание теста..."
							rows={3}
						/>
					</div>

					<div className="space-y-2">
						<Label>Лимит времени (минуты)</Label>
						<Input
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
							<p className="text-muted-foreground text-xs">
								{Math.floor(form.timeLimitMinutes! / 60)} ч{' '}
								{form.timeLimitMinutes! % 60 > 0 ? `${form.timeLimitMinutes! % 60} мин` : ''}
							</p>
						)}
					</div>

					{form.timeLimitMinutes ? (
						<div className="space-y-3">
							<div className="space-y-2">
								<Label>Красный таймер (мин до конца, null = глобальный)</Label>
								<div className="flex gap-2">
									<Input
										type="number"
										min={1}
										value={form.redThresholdMinutes ?? ''}
										onChange={(e) =>
											setForm({
												...form,
												redThresholdMinutes: e.target.value ? parseInt(e.target.value) : null,
											})
										}
										placeholder="Глобальный (5 мин)"
										className="flex-1"
									/>
									{form.redThresholdMinutes !== null && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="rounded-full"
											onClick={() => setForm({ ...form, redThresholdMinutes: null })}
										>
											Сброс
										</Button>
									)}
								</div>
							</div>
							<div className="space-y-2">
								<Label>Предупреждение (мин до конца, null = глобальный)</Label>
								<div className="flex gap-2">
									<Input
										type="number"
										min={1}
										value={form.warningThresholdMinutes ?? ''}
										onChange={(e) =>
											setForm({
												...form,
												warningThresholdMinutes: e.target.value ? parseInt(e.target.value) : null,
											})
										}
										placeholder="Глобальный (1 мин)"
										className="flex-1"
									/>
									{form.warningThresholdMinutes !== null && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="rounded-full"
											onClick={() => setForm({ ...form, warningThresholdMinutes: null })}
										>
											Сброс
										</Button>
									)}
								</div>
							</div>
						</div>
					) : null}

					<div className="space-y-2">
						<Label>Проходной балл (%)</Label>
						<Input
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

					<div className="space-y-3">
						<Label>Начисление баллов</Label>
						{isEditingExisting && topicSlug && testSlug ? (
							<div className="space-y-2">
								<Button variant="outline" asChild className="w-full rounded-full">
									<Link href={`/admin/tests/scoring?scope=test&topicSlug=${topicSlug}&testSlug=${testSlug}`}>
										Настроить баллы для этого теста
									</Link>
								</Button>
								<Button variant="outline" asChild className="w-full rounded-full">
									<Link href="/admin/tests/question-types">Настроить типы вопросов</Link>
								</Button>
							</div>
						) : (
							<p className="text-muted-foreground text-sm">Сохраните тест, чтобы настроить баллы для него отдельно.</p>
						)}
					</div>

					<div className="flex items-center justify-between pt-2">
						<Label>Опубликовать</Label>
						<Switch
							checked={form.isPublished}
							onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })}
						/>
					</div>
					{isCreateMode && form.isPublished && form.questions.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							Первое сохранение создаст черновик. Опубликовать тест можно после добавления хотя бы одного вопроса.
						</p>
					) : null}

					<div className="flex items-center justify-between pt-2">
						<Label>Показывать правильный ответ после проверки</Label>
						<Switch
							checked={form.showCorrectAnswer}
							onCheckedChange={(checked) => setForm({ ...form, showCorrectAnswer: checked })}
						/>
					</div>
				</ScrollArea>
				<Button onClick={onSave} disabled={saving} className="w-full rounded-full">
					{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
					Сохранить
				</Button>
			</div>
		</AdminTestsSectionCard>
	)
}
