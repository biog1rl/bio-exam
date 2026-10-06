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
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

import type { LucideIcon } from 'lucide-react'
import {
	CircleIcon,
	ExternalLink,
	Eye,
	EyeOff,
	GripVertical,
	MoreHorizontal,
	Pencil,
	Plus,
	Search,
	Trash2,
} from 'lucide-react'
import * as Icons from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { toast } from 'sonner'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarButton, ToolbarTooltip } from '@/components/page/ToolbarButton'
import { TableCard } from '@/components/table/TableCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useUiAlertDialog } from '@/components/ui/use-ui-alert-dialog'
import { failureMessage } from '@/lib/http/errors'
import { RequestError, type RequestFailure } from '@/lib/http/request'
import {
	deleteSidebarItem,
	getAllSidebarItems,
	reorderSidebarItems,
	saveSidebarItem,
	setSidebarItemActive,
	type SidebarItem,
} from '@/lib/settings/api'
import { SIDEBAR_RELOAD_ERROR, moveSidebarItem, sidebarReloadFailure } from '@/lib/settings/sidebar-items'
import { cn } from '@/lib/utils/cn'

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

function SidebarLinkRow({
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

	const IconComponent = getIconComponent(item.icon)
	const visibility = item.isActive ? 'Показана' : 'Скрыта'

	return (
		<TableRow
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(isDragging && 'relative z-10 bg-card shadow-md')}
		>
			<TableCell className="w-10 pr-0 pl-3">
				<button
					type="button"
					{...attributes}
					{...listeners}
					aria-label={`Перетащить ссылку ${item.title}`}
					className="flex cursor-grab rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
				>
					<GripVertical className="size-4" aria-hidden="true" />
				</button>
			</TableCell>
			<TableCell className="py-3 pl-2">
				<div className="flex min-w-0 items-center gap-2">
					<IconComponent className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span
						className={cn(
							'min-w-0 font-medium [overflow-wrap:anywhere]',
							item.isActive ? 'text-foreground' : 'text-muted-foreground'
						)}
					>
						{item.title}
					</span>
					{item.target === '_blank' ? (
						<span title="Откроется в новой вкладке" className="shrink-0 text-muted-foreground">
							<ExternalLink className="size-3.5" aria-hidden="true" />
							<span className="sr-only">Откроется в новой вкладке.</span>
						</span>
					) : null}
				</div>
				<p className="mt-0.5 truncate text-xs text-muted-foreground tab-sm:hidden">
					{item.url}
					<span className="mob:hidden"> · {visibility.toLowerCase()}</span>
				</p>
			</TableCell>
			<TableCell className="hidden truncate text-muted-foreground tab-sm:table-cell">{item.url}</TableCell>
			<TableCell className="hidden mob:table-cell">
				<Badge variant={item.isActive ? 'default' : 'secondary'} className="rounded-full">
					{visibility}
				</Badge>
			</TableCell>
			<TableCell className="pr-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-full"
							aria-label={`Действия со ссылкой ${item.title}`}
						>
							<MoreHorizontal className="size-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => onEdit(item)}>
							<Pencil className="size-4" aria-hidden="true" />
							Изменить
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onToggle(item.id)}>
							{item.isActive ? (
								<EyeOff className="size-4" aria-hidden="true" />
							) : (
								<Eye className="size-4" aria-hidden="true" />
							)}
							{item.isActive ? 'Скрыть из меню' : 'Показать в меню'}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(item.id)}>
							<Trash2 className="size-4" aria-hidden="true" />
							Удалить
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	)
}

export function SidebarSettingsClient() {
	const { confirm, alertDialog } = useUiAlertDialog()
	const [items, setItems] = useState<SidebarItem[]>([])
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState<RequestError | null>(null)
	const loadedRef = useRef(false)
	const titleRef = useRef<HTMLHeadingElement>(null)
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

	const loadItems = useCallback(async () => {
		const outcome = await getAllSidebarItems()
		if (!outcome.ok) {
			const failure = sidebarReloadFailure({ loaded: loadedRef.current, kind: outcome.kind })
			if (failure === 'silent') return
			if (failure === 'block') setLoadError(new RequestError(outcome))
			else toast.error(SIDEBAR_RELOAD_ERROR)
			setLoading(false)
			return
		}
		loadedRef.current = true
		setItems(outcome.data)
		setLoadError(null)
		setLoading(false)
	}, [])

	useEffect(() => {
		void loadItems()
	}, [loadItems])

	const showActionError = (outcome: RequestFailure, fallback: string) => {
		const message = failureMessage(outcome, fallback)
		if (message) toast.error(message)
	}

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event
		if (!over) return

		const previousItems = items
		const reorderedItems = moveSidebarItem(items, String(active.id), String(over.id))
		if (!reorderedItems) return
		setItems(reorderedItems)

		const outcome = await reorderSidebarItems(reorderedItems.map((item) => ({ id: item.id, order: item.order })))
		if (!outcome.ok) {
			setItems(previousItems)
			showActionError(outcome, 'Ошибка обновления порядка')
			void loadItems()
			return
		}
		toast.success('Порядок обновлен')
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

		const outcome = editingItem
			? await saveSidebarItem(editingItem.id, formData)
			: await saveSidebarItem(null, { ...formData, order: items.length })
		if (!outcome.ok) {
			showActionError(outcome, 'Ошибка сохранения')
			return
		}
		toast.success(editingItem ? 'Пункт обновлен' : 'Пункт добавлен')
		setDialogOpen(false)
		void loadItems()
	}

	const handleToggle = async (id: string) => {
		const item = items.find((i) => i.id === id)
		if (!item) return

		const outcome = await setSidebarItemActive(id, !item.isActive)
		if (!outcome.ok) {
			showActionError(outcome, 'Ошибка изменения видимости')
			return
		}
		void loadItems()
		toast.success(item.isActive ? 'Пункт скрыт' : 'Пункт показан')
	}

	const handleDelete = async (id: string) => {
		const confirmed = await confirm({
			title: 'Удалить пункт меню?',
			description: 'Пункт будет удален без возможности восстановления.',
			confirmText: 'Удалить',
			cancelText: 'Отмена',
			destructive: true,
		})
		if (!confirmed) return

		const outcome = await deleteSidebarItem(id)
		if (!outcome.ok) {
			showActionError(outcome, 'Ошибка удаления')
			return
		}
		void loadItems()
		toast.success('Пункт удален')
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

	return (
		<div className="space-y-4">
			<PageHeader
				title="Ссылки в меню"
				titleRef={titleRef}
				meta="Разделы сайта попадают в меню сами, здесь — дополнительные ссылки"
			>
				<ToolbarTooltip label="Добавить пункт">
					<ToolbarButton tone="primary" label="Добавить пункт" onClick={handleAdd}>
						<Plus className="size-4" aria-hidden="true" />
					</ToolbarButton>
				</ToolbarTooltip>
			</PageHeader>

			{loadError ? (
				<LoadErrorAlert
					title="Не удалось загрузить пункты меню"
					error={loadError}
					onRetry={loadItems}
					focusTarget={titleRef}
				/>
			) : loading ? (
				<Skeleton className="h-72 rounded-3xl" aria-label="Загрузка пунктов меню" />
			) : items.length === 0 ? (
				<EmptyState
					title="Дополнительных ссылок пока нет"
					action={
						<Button className="rounded-full" onClick={handleAdd}>
							Добавить первый пункт
						</Button>
					}
				/>
			) : (
				<TableCard>
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
							<Table className="table-fixed">
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="w-10 pl-3">
											<span className="sr-only">Порядок</span>
										</TableHead>
										<TableHead className="pl-2">Ссылка</TableHead>
										<TableHead className="hidden w-64 tab-sm:table-cell lg:w-80">Адрес</TableHead>
										<TableHead className="hidden w-32 mob:table-cell">Видимость</TableHead>
										<TableHead className="w-14 pr-3">
											<span className="sr-only">Действия</span>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => (
										<SidebarLinkRow
											key={item.id}
											item={item}
											onEdit={handleEdit}
											onToggle={handleToggle}
											onDelete={handleDelete}
										/>
									))}
								</TableBody>
							</Table>
						</SortableContext>
					</DndContext>
				</TableCard>
			)}

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
							<Label htmlFor="sidebar-link-url">Адрес</Label>
							<Input
								id="sidebar-link-url"
								value={formData.url}
								onChange={(e) => setFormData({ ...formData, url: e.target.value })}
								placeholder="/tests или https://example.ru"
								aria-describedby="sidebar-link-url-hint"
							/>
							<p id="sidebar-link-url-hint" className="text-xs text-muted-foreground">
								Путь от корня сайта, например /tests, или полный адрес http(s)://…
							</p>
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
								<Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Поиск иконок..."
									value={iconSearch}
									onChange={(e) => setIconSearch(e.target.value)}
									className="pl-8"
								/>
							</div>
							{iconSearch.trim().length >= 2 && searchResults.length > 0 && (
								<p className="text-xs text-muted-foreground">
									Показано: {filteredIcons.length} из {searchResults.length}
								</p>
							)}
						</div>

						<ScrollArea className="h-100">
							{filteredIcons.length === 0 ? (
								<div className="p-8 text-center text-sm text-muted-foreground">
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
			{alertDialog}
		</div>
	)
}
