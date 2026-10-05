'use client'

import { useEffect, useMemo, useState } from 'react'

import { Check, ChevronsUpDown, X } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/components/providers/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { failureMessage } from '@/lib/http/errors'
import { fetchTopicTeacherOptions, saveTopic, setTopicTeachers } from '@/lib/tests/admin-api'
import {
	TEACHERS_EMPTY,
	TEACHERS_FIELD_LABEL,
	TEACHERS_HINT,
	TEACHERS_SEARCH_PLACEHOLDER,
	canManageCatalog,
	teacherDisplayName,
	teacherTriggerLabel,
	teachersSetChanged,
	topicSaveOutcome,
	type TopicTeacher,
} from '@/lib/tests/bank-view'
import { cn } from '@/lib/utils/cn'
import { transliterate } from '@/lib/utils/transliterate'

import type { Topic, TopicFormData } from '../types'

const SLUG_REGEX = /^[a-z0-9-]+$/

function validateSlug(slug: string): string | null {
	if (!slug) return 'Slug обязателен'
	if (slug.length < 2) return 'Минимум 2 символа'
	if (slug.length > 100) return 'Максимум 100 символов'
	if (!SLUG_REGEX.test(slug)) return 'Только латинские буквы, цифры и дефисы'
	return null
}

function filterByName(_value: string, search: string, keywords?: string[]): number {
	const query = search.trim().toLowerCase()
	if (!query) return 1
	return (keywords ?? []).join(' ').toLowerCase().includes(query) ? 1 : 0
}

interface TopicFormDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	editingTopic?: Topic | null
	initialOrder?: number
	showIsActive?: boolean
	onSaved: (topic?: { id?: string }) => void
}

export function TopicFormDialog({
	open,
	onOpenChange,
	editingTopic,
	initialOrder = 0,
	showIsActive = false,
	onSaved,
}: TopicFormDialogProps) {
	const isEditing = Boolean(editingTopic)
	const { perms } = useAuth()
	const catalog = canManageCatalog(perms)

	const [form, setForm] = useState<TopicFormData>({
		slug: '',
		title: '',
		description: '',
		order: initialOrder,
		isActive: true,
	})
	const [slugError, setSlugError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [teacherOptions, setTeacherOptions] = useState<TopicTeacher[]>([])
	const [teacherIds, setTeacherIds] = useState<string[]>([])
	const [initialTeacherIds, setInitialTeacherIds] = useState<string[]>([])
	const [teachersOpen, setTeachersOpen] = useState(false)

	useEffect(() => {
		if (open) {
			setForm({
				slug: editingTopic?.slug ?? '',
				title: editingTopic?.title ?? '',
				description: editingTopic?.description ?? '',
				order: editingTopic?.order ?? initialOrder,
				isActive: editingTopic?.isActive ?? true,
			})
			setSlugError(null)
			const ids = (editingTopic?.teachers ?? []).map((teacher) => teacher.id)
			setTeacherIds(ids)
			setInitialTeacherIds(ids)
			setTeachersOpen(false)
		}
	}, [open, editingTopic, initialOrder])

	useEffect(() => {
		if (!open || !catalog) return
		let cancelled = false
		fetchTopicTeacherOptions().then((outcome) => {
			if (!cancelled) setTeacherOptions(outcome.ok ? outcome.data.teachers : [])
		})
		return () => {
			cancelled = true
		}
	}, [open, catalog])

	const knownTeachers = useMemo(() => {
		const byId = new Map<string, TopicTeacher>()
		for (const teacher of editingTopic?.teachers ?? []) byId.set(teacher.id, teacher)
		for (const teacher of teacherOptions) byId.set(teacher.id, teacher)
		return byId
	}, [editingTopic, teacherOptions])

	const selectedTeachers = useMemo(
		() => teacherIds.map((id) => knownTeachers.get(id)).filter((teacher): teacher is TopicTeacher => Boolean(teacher)),
		[teacherIds, knownTeachers]
	)

	const toggleTeacher = (id: string) => {
		setTeacherIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
	}

	const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const title = e.target.value
		if (isEditing) {
			setForm((prev) => ({ ...prev, title }))
		} else {
			const newSlug = transliterate(title)
			setSlugError(validateSlug(newSlug))
			setForm((prev) => ({ ...prev, title, slug: newSlug }))
		}
	}

	const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const slug = e.target.value
		setSlugError(validateSlug(slug))
		setForm((prev) => ({ ...prev, slug }))
	}

	const handleSave = async () => {
		if (saving) return
		if (!form.title) {
			toast.error('Введите название')
			return
		}
		const slugErr = validateSlug(form.slug)
		if (slugErr) {
			setSlugError(slugErr)
			return
		}

		setSaving(true)
		try {
			const saved = await saveTopic({ id: isEditing ? editingTopic!.id : undefined, body: form })
			if (!saved.ok) {
				const message = failureMessage(saved, 'Ошибка сохранения')
				if (message) toast.error(message)
				return
			}

			const topicId = isEditing ? editingTopic!.id : saved.data.topic.id
			const teachers =
				catalog && teachersSetChanged(initialTeacherIds, teacherIds)
					? await setTopicTeachers(topicId, teacherIds)
					: null
			const teachersSilent =
				teachers !== null && !teachers.ok && (teachers.kind === 'auth' || teachers.kind === 'aborted')
			const teachersStatus = teachers === null ? null : teachers.ok ? teachers.status : (teachers.status ?? 0)
			const outcome = topicSaveOutcome({ isEditing, teachersStatus })
			if (outcome.kind === 'success') toast.success(outcome.message)
			else if (!teachersSilent) toast.error(outcome.message)
			onOpenChange(false)
			onSaved(saved.data.topic)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-dvh overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEditing ? 'Редактировать тему' : 'Новая тема'}</DialogTitle>
					<DialogDescription>Темы помогают организовать тесты по категориям</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Название</Label>
						<Input value={form.title} onChange={handleTitleChange} placeholder="Биология 9 класс" />
					</div>

					<div className="space-y-2">
						<Label>Slug (URL)</Label>
						<Input
							value={form.slug}
							onChange={handleSlugChange}
							placeholder="biology-9"
							className={slugError ? 'border-destructive focus-visible:ring-destructive' : ''}
						/>
						{slugError ? (
							<p className="text-xs text-destructive">{slugError}</p>
						) : (
							<p className="text-xs text-muted-foreground">Только латинские буквы, цифры и дефисы</p>
						)}
					</div>

					<div className="space-y-2">
						<Label>Описание</Label>
						<Textarea
							value={form.description}
							onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
							placeholder="Описание темы..."
							rows={3}
						/>
					</div>

					{catalog ? (
						<div className="space-y-2">
							<Label>{TEACHERS_FIELD_LABEL}</Label>
							<Popover open={teachersOpen} onOpenChange={setTeachersOpen} modal>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between">
										<span className="min-w-0 truncate">{teacherTriggerLabel(selectedTeachers)}</span>
										<ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
									<Command filter={filterByName}>
										<CommandInput placeholder={TEACHERS_SEARCH_PLACEHOLDER} />
										<CommandList className="max-h-60">
											<CommandEmpty>{TEACHERS_EMPTY}</CommandEmpty>
											<CommandGroup>
												{teacherOptions.map((teacher) => {
													const label = teacherDisplayName(teacher)
													const selected = teacherIds.includes(teacher.id)
													return (
														<CommandItem
															key={teacher.id}
															value={teacher.id}
															keywords={[label]}
															onSelect={() => toggleTeacher(teacher.id)}
														>
															<Check
																className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')}
																aria-hidden="true"
															/>
															<span className="min-w-0 truncate">{label}</span>
														</CommandItem>
													)
												})}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
							{selectedTeachers.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{selectedTeachers.map((teacher) => {
										const label = teacherDisplayName(teacher)
										return (
											<Badge key={teacher.id} variant="secondary" className="max-w-full gap-1">
												<span className="min-w-0 truncate">{label}</span>
												<button
													type="button"
													aria-label={`Убрать ${label}`}
													onClick={() => toggleTeacher(teacher.id)}
													className="shrink-0 rounded-sm"
												>
													<X className="size-3" aria-hidden="true" />
												</button>
											</Badge>
										)
									})}
								</div>
							) : null}
							<p className="text-xs text-muted-foreground">{TEACHERS_HINT}</p>
						</div>
					) : null}

					{showIsActive && (
						<div className="flex items-center justify-between">
							<Label>Активна</Label>
							<Switch
								checked={form.isActive}
								onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
							/>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Отмена
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? 'Сохранение…' : isEditing ? 'Сохранить тему' : 'Создать тему'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
