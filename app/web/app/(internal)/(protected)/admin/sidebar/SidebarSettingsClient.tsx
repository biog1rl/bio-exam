'use client'

import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

import type { LucideIcon } from 'lucide-react'
import { GripVertical, Plus, Trash2, Eye, EyeOff, ExternalLink, Search, CircleIcon } from 'lucide-react'
import * as Icons from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SidebarItem {
	id: string
	title: string
	url: string
	icon: string
	target: '_self' | '_blank'
	order: number
	isActive: boolean
}

const iconsMap = Icons as Record<string, unknown>

// Получаем компонент иконки по имени
function getIconComponent(iconName: string): LucideIcon {
	const icon = iconsMap[iconName]

	// Проверяем что это React компонент (ForwardRef)
	if (icon && typeof icon === 'object' && '$$typeof' in icon) {
		return icon as LucideIcon
	}

	return CircleIcon
}

function SortableItem({
	item,
	onEdit,
	onToggle,
	onDelete,
}: {
	item: SidebarItem
	onEdit: (item: SidebarItem) => void
	onToggle: (id: string) => void
	onDelete: (id: string) => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}

	const IconComponent = getIconComponent(item.icon)

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="bg-card hover:bg-accent/50 flex items-center gap-2 rounded-lg border p-3"
		>
			<button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
				<GripVertical className="text-muted-foreground h-5 w-5" />
			</button>

			<div className="flex flex-1 items-center gap-3">
				<IconComponent className="h-5 w-5" />
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<span className="font-medium">{item.title}</span>
						{item.target === '_blank' && <ExternalLink className="text-muted-foreground h-3 w-3" />}
					</div>
					<span className="text-muted-foreground text-sm">{item.url}</span>
				</div>
			</div>

			<div className="flex items-center gap-1">
				<Button size="sm" variant="ghost" onClick={() => onToggle(item.id)}>
					{item.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
				</Button>
				<Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
					Изменить
				</Button>
				<Button size="sm" variant="ghost" onClick={() => onDelete(item.id)}>
					<Trash2 className="text-destructive h-4 w-4" />
				</Button>
			</div>
		</div>
	)
}

export function SidebarSettingsClient() {
	const [items, setItems] = useState<SidebarItem[]>([])
	const [loading, setLoading] = useState(true)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [iconPickerOpen, setIconPickerOpen] = useState(false)
	const [editingItem, setEditingItem] = useState<SidebarItem | null>(null)
	const [formData, setFormData] = useState({
		title: '',
		url: '',
		icon: 'CircleIcon',
		target: '_self' as '_self' | '_blank',
	})
	const [iconSearch, setIconSearch] = useState('')
	const [displayLimit, setDisplayLimit] = useState(50)

	// Получаем все доступные иконки из lucide-react через dynamicIconImports
	const allIcons = useMemo(() => {
		// Преобразуем kebab-case имена из dynamicIconImports в PascalCase
		const icons = Object.keys(dynamicIconImports)
			.map((kebabName) => {
				// Преобразуем 'arrow-down' в 'ArrowDown'
				return kebabName
					.split('-')
					.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
					.join('')
			})
			.sort()

		return Array.from(new Set(icons))
	}, [])

	// Все найденные иконки по поисковому запросу
	const searchResults = useMemo(() => {
		const searchTerm = iconSearch.trim().toLowerCase()

		// Требуем минимум 2 символа для поиска
		if (searchTerm.length < 2) {
			return []
		}

		return allIcons.filter((iconName) => iconName.toLowerCase().includes(searchTerm))
	}, [allIcons, iconSearch])

	// Отображаемые иконки с учетом лимита
	const filteredIcons = useMemo(() => {
		return searchResults.slice(0, displayLimit)
	}, [searchResults, displayLimit])

	// Сбрасываем лимит при изменении поиска
	useEffect(() => {
		setDisplayLimit(50)
	}, [iconSearch])

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	const observerTarget = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		loadItems()
	}, [])

	const loadItems = async () => {
		try {
			const res = await fetch('/api/sidebar/all', { credentials: 'include' })
			if (!res.ok) throw new Error('Failed to load')
			const data = await res.json()
			setItems(data.items || [])
		} catch (err) {
			console.error(err)
			toast.error('Ошибка загрузки пунктов меню')
		} finally {
			setLoading(false)
		}
	}

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const oldIndex = items.findIndex((item) => item.id === active.id)
		const newIndex = items.findIndex((item) => item.id === over.id)

		const newItems = arrayMove(items, oldIndex, newIndex)
		const reorderedItems = newItems.map((item, index) => ({ ...item, order: index }))
		setItems(reorderedItems)

		try {
			await fetch('/api/sidebar/reorder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					items: reorderedItems.map((item) => ({ id: item.id, order: item.order })),
				}),
			})
			toast.success('Порядок обновлен')
		} catch (err) {
			console.error(err)
			toast.error('Ошибка обновления порядка')
			loadItems()
		}
	}

	const handleAdd = () => {
		setEditingItem(null)
		setFormData({ title: '', url: '', icon: 'CircleIcon', target: '_self' })
		setIconSearch('')
		setDialogOpen(true)
	}

	const handleEdit = (item: SidebarItem) => {
		setEditingItem(item)
		setFormData({
			title: item.title,
			url: item.url,
			icon: item.icon,
			target: item.target,
		})
		setIconSearch('')
		setDialogOpen(true)
	}

	const handleSave = async () => {
		if (!formData.title || !formData.url) {
			toast.error('Заполните все поля')
			return
		}

		try {
			if (editingItem) {
				const res = await fetch(`/api/sidebar/${editingItem.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(formData),
				})
				if (!res.ok) throw new Error('Failed to update')
				toast.success('Пункт обновлен')
			} else {
				const res = await fetch('/api/sidebar', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ ...formData, order: items.length }),
				})
				if (!res.ok) throw new Error('Failed to create')
				toast.success('Пункт добавлен')
			}
			setDialogOpen(false)
			loadItems()
		} catch (err) {
			console.error(err)
			toast.error('Ошибка сохранения')
		}
	}

	const handleToggle = async (id: string) => {
		const item = items.find((i) => i.id === id)
		if (!item) return

		try {
			await fetch(`/api/sidebar/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ isActive: !item.isActive }),
			})
			loadItems()
			toast.success(item.isActive ? 'Пункт скрыт' : 'Пункт показан')
		} catch (err) {
			console.error(err)
			toast.error('Ошибка изменения видимости')
		}
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Удалить этот пункт меню?')) return

		try {
			await fetch(`/api/sidebar/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			})
			loadItems()
			toast.success('Пункт удален')
		} catch (err) {
			console.error(err)
			toast.error('Ошибка удаления')
		}
	}

	const handleSelectIcon = (iconName: string) => {
		setFormData({ ...formData, icon: iconName })
		setIconPickerOpen(false)
		setIconSearch('')
		setDisplayLimit(50)
	}

	const handleLoadMore = useCallback(() => {
		setDisplayLimit((prev) => prev + 50)
	}, [])

	const hasMore = searchResults.length > filteredIcons.length

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore) {
					handleLoadMore()
				}
			},
			{ threshold: 1.0 }
		)

		if (observerTarget.current) {
			observer.observe(observerTarget.current)
		}

		return () => observer.disconnect()
	}, [hasMore, handleLoadMore])

	if (loading) {
		return <div className="p-6">Загрузка...</div>
	}

	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Настройки сайдбара</h1>
					<p className="text-muted-foreground">Управление пунктами бокового меню</p>
				</div>
				<Button onClick={handleAdd}>
					<Plus className="mr-2 h-4 w-4" />
					Добавить пункт
				</Button>
			</div>

			<Card className="p-4">
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
						<div className="space-y-2">
							{items.map((item) => (
								<SortableItem
									key={item.id}
									item={item}
									onEdit={handleEdit}
									onToggle={handleToggle}
									onDelete={handleDelete}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>

				{items.length === 0 && (
					<div className="text-muted-foreground py-12 text-center">Нет пунктов меню. Добавьте первый!</div>
				)}
			</Card>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editingItem ? 'Редактировать пункт' : 'Новый пункт меню'}</DialogTitle>
						<DialogDescription>Настройте параметры пункта бокового меню</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label>Название</Label>
							<Input
								value={formData.title}
								onChange={(e) => setFormData({ ...formData, title: e.target.value })}
								placeholder="Проекты"
							/>
						</div>

						<div className="space-y-2">
							<Label>URL</Label>
							<Input
								value={formData.url}
								onChange={(e) => setFormData({ ...formData, url: e.target.value })}
								placeholder="/projects"
							/>
						</div>

						<div className="space-y-2">
							<Label>Иконка</Label>
							<Button
								type="button"
								variant="outline"
								className="w-full justify-start"
								onClick={() => setIconPickerOpen(true)}
							>
								{(() => {
									const Icon = getIconComponent(formData.icon)
									return <Icon className="mr-2 h-4 w-4" />
								})()}
								{formData.icon}
							</Button>
						</div>

						<div className="space-y-2">
							<Label>Открывать в</Label>
							<Select
								value={formData.target}
								onValueChange={(value) => setFormData({ ...formData, target: value as '_self' | '_blank' })}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="_self">Текущей вкладке</SelectItem>
									<SelectItem value="_blank">Новой вкладке</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Отмена
						</Button>
						<Button onClick={handleSave}>{editingItem ? 'Сохранить' : 'Добавить'}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Выбор иконки</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<div className="relative">
								<Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
								<Input
									placeholder="Поиск иконок..."
									value={iconSearch}
									onChange={(e) => setIconSearch(e.target.value)}
									className="pl-8"
								/>
							</div>
							{iconSearch.trim().length >= 2 && searchResults.length > 0 && (
								<p className="text-muted-foreground text-xs">
									Показано: {filteredIcons.length} из {searchResults.length}
								</p>
							)}
						</div>

						<ScrollArea className="h-[400px]">
							{filteredIcons.length === 0 ? (
								<div className="text-muted-foreground p-8 text-center text-sm">
									{iconSearch.trim().length < 2 ? 'Введите минимум 2 символа для поиска' : 'Иконки не найдены'}
								</div>
							) : (
								<div className="flex flex-wrap p-2">
									{filteredIcons.map((iconName) => {
										const Icon = getIconComponent(iconName)
										const isSelected = formData.icon === iconName
										return (
											<Button
												key={iconName}
												type="button"
												variant={isSelected ? 'default' : 'ghost'}
												size="icon"
												onClick={() => handleSelectIcon(iconName)}
											>
												<Icon className="size-4" />
											</Button>
										)
									})}
									{hasMore && (
										<Button ref={observerTarget} variant="ghost" className="w-full" onClick={handleLoadMore}>
											Загрузить еще
										</Button>
									)}
								</div>
							)}
						</ScrollArea>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setIconPickerOpen(false)}>
							Закрыть
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
