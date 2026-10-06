'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { $getRoot, LexicalEditor, LexicalNode } from 'lexical'
import { ImageIcon, Trash2, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'

import { $isImageNode } from '@/components/editor/nodes/image-node'
import { INSERT_IMAGE_COMMAND } from '@/components/editor/plugins/images-plugin'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { useAuth } from '@/components/providers/AuthProvider'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useObjectUrl } from '@/hooks/use-object-url'
import { deleteAsset, listAssets, UPLOAD_FAILED_MESSAGE, uploadAsset } from '@/lib/assets/api'
import { failureMessage } from '@/lib/http/errors'
import { RequestError } from '@/lib/http/request'
import type { AssetFile } from '@/types/assets'

const PAGE_SIZE = 20

type MediaLibraryProps = {
	editor: LexicalEditor
	onClose: () => void
}

export function MediaLibrary({ editor, onClose }: MediaLibraryProps) {
	const { can } = useAuth()
	const canWrite = can('tests', 'write')
	const [assets, setAssets] = useState<AssetFile[]>([])
	const [total, setTotal] = useState(0)
	const [isLoading, setIsLoading] = useState(false)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const [loadError, setLoadError] = useState<RequestError | null>(null)
	const loadedRef = useRef(false)
	const [offset, setOffset] = useState(0)
	const [deleteTarget, setDeleteTarget] = useState<AssetFile | null>(null)
	const [isUsedInDoc, setIsUsedInDoc] = useState(false)
	const [deleteError, setDeleteError] = useState<string | null>(null)
	const [isDeleting, setIsDeleting] = useState(false)

	// Upload tab state
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [altText, setAltText] = useState('')
	const [isUploading, setIsUploading] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	const [activeTab, setActiveTab] = useState('library')
	const previewUrl = useObjectUrl(selectedFile)

	const loadAssets = useCallback(async (currentOffset: number, append: boolean) => {
		if (append) {
			setIsLoadingMore(true)
		} else {
			setIsLoading(true)
		}
		const outcome = await listAssets(PAGE_SIZE, currentOffset)
		if (!outcome.ok) {
			if (outcome.kind === 'auth' || outcome.kind === 'aborted') return
			if (append || loadedRef.current) {
				toast.error('Не удалось загрузить изображения')
			} else {
				setLoadError(new RequestError(outcome))
			}
		} else {
			const page = outcome.data
			setAssets((prev) => (append ? [...prev, ...page.assets] : page.assets))
			setTotal(page.total)
			setOffset(currentOffset)
			loadedRef.current = true
			setLoadError(null)
		}
		setIsLoading(false)
		setIsLoadingMore(false)
	}, [])

	useEffect(() => {
		if (!canWrite) return
		loadAssets(0, false)
	}, [canWrite, loadAssets])

	const handleLoadMore = () => {
		void loadAssets(offset + PAGE_SIZE, true)
	}

	const handleSelect = (asset: AssetFile) => {
		editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
			src: asset.path,
			altText: asset.filename,
		})
		onClose()
	}

	const checkUsageInEditor = useCallback(
		(assetPath: string): boolean => {
			let found = false
			editor.getEditorState().read(() => {
				const root = $getRoot()
				const visit = (node: LexicalNode) => {
					if ($isImageNode(node) && node.__src === assetPath) {
						found = true
						return
					}
					if ('getChildren' in node) {
						;(node as any).getChildren().forEach(visit)
					}
				}
				root.getChildren().forEach(visit)
			})
			return found
		},
		[editor]
	)

	const handleDeleteClick = (asset: AssetFile) => {
		const used = checkUsageInEditor(asset.path)
		setIsUsedInDoc(used)
		setDeleteError(null)
		setDeleteTarget(asset)
	}

	const handleDeleteConfirm = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault()
		if (!deleteTarget || isDeleting) return
		const target = deleteTarget
		setIsDeleting(true)
		const outcome = await deleteAsset({ path: target.path })
		setIsDeleting(false)
		if (!outcome.ok) {
			if (outcome.kind === 'auth' || outcome.kind === 'aborted') return
			setDeleteError(outcome.message)
			return
		}
		setAssets((prev) => prev.filter((a) => a.path !== target.path))
		setTotal((prev) => prev - 1)
		toast.success('Изображение удалено')
		setDeleteTarget(null)
	}

	// Upload handlers
	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (file) {
			setSelectedFile(file)
			setAltText(file.name.replace(/\.[^.]+$/, ''))
		}
	}

	const handleUpload = async () => {
		if (!selectedFile) return

		if (selectedFile.size > 5 * 1024 * 1024) {
			toast.error('Файл слишком большой. Максимум 5 MB')
			return
		}

		setIsUploading(true)
		const formData = new FormData()
		formData.append('file', selectedFile)
		const outcome = await uploadAsset(formData)
		if (!outcome.ok) {
			setIsUploading(false)
			const message = failureMessage(outcome, UPLOAD_FAILED_MESSAGE)
			if (message) toast.error(message)
			return
		}
		if (outcome.data.success) {
			toast.success('Изображение загружено')
			await loadAssets(0, false)
			setSelectedFile(null)
			setAltText('')
			setActiveTab('library')
		}
		setIsUploading(false)
	}

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(false)

		const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
		const file = e.dataTransfer.files[0]
		if (file && ALLOWED.includes(file.type)) {
			setSelectedFile(file)
			setAltText(file.name.replace(/\.[^.]+$/, ''))
		} else {
			toast.error('Поддерживаются только JPEG, PNG и WebP')
		}
	}

	if (!canWrite) return null

	return (
		<>
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
				<TabsList className="w-full">
					<TabsTrigger value="library" className="w-full">
						Библиотека
					</TabsTrigger>
					<TabsTrigger value="upload" className="w-full">
						Загрузить
					</TabsTrigger>
				</TabsList>

				<TabsContent value="library" className="mt-4">
					<ScrollArea className="h-100 w-full">
						{loadError ? (
							<LoadErrorAlert
								title="Не удалось загрузить изображения"
								error={loadError}
								onRetry={() => loadAssets(0, false)}
							/>
						) : isLoading ? (
							<div className="flex h-full items-center justify-center">
								<p className="text-muted-foreground">Загрузка...</p>
							</div>
						) : assets.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center gap-2">
								<ImageIcon className="size-12 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">Изображения ещё не загружены</p>
							</div>
						) : (
							<>
								<div className="grid grid-cols-3 gap-3 md:grid-cols-3">
									{assets.map((asset) => (
										<div key={asset.path} className="group relative aspect-square overflow-hidden rounded-lg border">
											<button onClick={() => handleSelect(asset)} className="size-full cursor-pointer">
												{/* Нативный тег img — подписанные URL-адреса являются динамическими и обходят оптимизацию next/image */}
												<img
													src={asset.signedUrl}
													alt={asset.filename}
													className="size-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
													loading="lazy"
												/>
											</button>
											{/* Кнопка удаления */}
											<button
												onClick={(e) => {
													e.stopPropagation()
													handleDeleteClick(asset)
												}}
												className="absolute top-1 right-1 cursor-pointer rounded-full bg-black/60 p-1 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-red-600 focus-visible:opacity-100 motion-reduce:transition-none"
												title="Удалить"
												aria-label={`Удалить ${asset.filename}`}
											>
												<Trash2 className="size-3.5" />
											</button>
											{/* Название файла */}
											<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-1.5">
												<p className="truncate text-xs text-white">{asset.filename}</p>
											</div>
										</div>
									))}
								</div>
								{/* Кнопка загрузки большего количества */}
								{assets.length < total && (
									<div className="flex justify-center">
										<Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
											{isLoadingMore ? 'Загрузка...' : 'Загрузить ещё'}
										</Button>
									</div>
								)}
							</>
						)}
					</ScrollArea>
				</TabsContent>

				<TabsContent value="upload" className="mt-4">
					<div className="space-y-4">
						{/* Область перетаскивания */}
						<div
							onDragEnter={handleDragEnter}
							onDragLeave={handleDragLeave}
							onDragOver={handleDragOver}
							onDrop={handleDrop}
							className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/50 transition-colors ${
								isDragging ? 'bg-primary/10' : 'hover:bg-muted/50'
							}`}
							onClick={() => document.getElementById('media-library-file-input')?.click()}
						>
							<UploadIcon className="mb-4 size-12 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">Перетащите изображение сюда или кликните для выбора</p>
							{selectedFile && <p className="mt-2 text-sm font-medium text-primary">{selectedFile.name}</p>}
						</div>

						{/* Скрытый ввод файла */}
						<Input
							id="media-library-file-input"
							type="file"
							accept="image/jpeg,image/png,image/webp"
							onChange={handleFileSelect}
							className="hidden"
						/>

						{/* Предварительный просмотр */}
						{selectedFile && (
							<div className="space-y-4">
								<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
									{/* Нативный img для предварительного просмотра URL-адреса blob: */}
									{previewUrl && <img src={previewUrl} alt="Preview" className="size-full object-contain" />}
								</div>

								<div className="space-y-2">
									<Label htmlFor="media-library-alt-text">Альтернативный текст</Label>
									<Input
										id="media-library-alt-text"
										placeholder="Описание изображения"
										value={altText}
										onChange={(e) => setAltText(e.target.value)}
									/>
								</div>

								<Button onClick={handleUpload} disabled={isUploading || !selectedFile} className="w-full">
									{isUploading ? 'Загрузка...' : 'Загрузить'}
								</Button>
							</div>
						)}
					</div>
				</TabsContent>
			</Tabs>

			{/* AlertDialog для подтверждения удаления */}
			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null)
						setDeleteError(null)
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Удалить изображение?</AlertDialogTitle>
						<AlertDialogDescription>
							{isUsedInDoc
								? 'Изображение используется в текущем документе. Оно также могло использоваться в других местах. Всё равно удалить?'
								: 'Изображение могло использоваться в других местах. Всё равно удалить?'}
						</AlertDialogDescription>
						{deleteError && (
							<p role="alert" className="text-sm text-destructive">
								{deleteError}
							</p>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						{!deleteError && (
							<AlertDialogAction
								onClick={handleDeleteConfirm}
								disabled={isDeleting}
								className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
							>
								Удалить
							</AlertDialogAction>
						)}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
