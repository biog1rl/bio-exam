'use client'

import { useEffect, useState } from 'react'

import { toast } from 'sonner'

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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-fetch'
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

	const [form, setForm] = useState<TopicFormData>({
		slug: '',
		title: '',
		description: '',
		order: initialOrder,
		isActive: true,
	})
	const [slugError, setSlugError] = useState<string | null>(null)

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
		}
	}, [open, editingTopic, initialOrder])

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
		if (!form.title) {
			toast.error('Введите название')
			return
		}
		const slugErr = validateSlug(form.slug)
		if (slugErr) {
			setSlugError(slugErr)
			return
		}

		try {
			const url = isEditing ? `/api/tests/topics/${editingTopic!.id}` : '/api/tests/topics'
			const method = isEditing ? 'PATCH' : 'POST'

			const res = await apiFetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			})

			if (!res.ok) {
				const data = await res.json()
				throw new Error(data.error || 'Ошибка сохранения')
			}

			const data = await res.json()
			toast.success(isEditing ? 'Тема обновлена' : 'Тема создана')
			onOpenChange(false)
			onSaved(data.topic)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Ошибка сохранения')
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
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
							<p className="text-destructive text-xs">{slugError}</p>
						) : (
							<p className="text-muted-foreground text-xs">Только латинские буквы, цифры и дефисы</p>
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
					<Button onClick={handleSave}>{isEditing ? 'Сохранить' : 'Создать'}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
