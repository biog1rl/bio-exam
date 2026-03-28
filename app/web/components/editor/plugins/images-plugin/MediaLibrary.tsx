'use client'

import { useCallback, useEffect, useState } from 'react'

import { ImageIcon, UploadIcon } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AssetFile, AssetsListResponse, UploadAssetResponse } from '@/types/assets'

type MediaLibraryProps = {
	docPath?: string // Опционально для обратной совместимости
	onSelect: (src: string, altText: string) => void
}

export function MediaLibrary({ docPath, onSelect }: MediaLibraryProps) {
	const [assets, setAssets] = useState<AssetFile[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [isUploading, setIsUploading] = useState(false)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [altText, setAltText] = useState('')
	const [isDragging, setIsDragging] = useState(false)

	// Загрузка списка существующих изображений
	const loadAssets = useCallback(async () => {
		setIsLoading(true)
		try {
			const response = await fetch('/api/docs/assets')
			if (!response.ok) {
				throw new Error('Failed to load assets')
			}
			const data: AssetsListResponse = await response.json()
			setAssets(data.assets)
		} catch (error) {
			console.error('Error loading assets:', error)
			toast.error('Не удалось загрузить изображения')
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		loadAssets()
	}, [loadAssets])

	// Обработка выбора файла через input
	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (file) {
			setSelectedFile(file)
			setAltText(file.name.replace(/\.[^.]+$/, ''))
		}
	}

	// Обработка загрузки файла
	const handleUpload = async () => {
		if (!selectedFile) return

		if (selectedFile.size > 5 * 1024 * 1024) {
			toast.error('Файл слишком большой. Максимум 5 MB')
			return
		}

		setIsUploading(true)
		try {
			const formData = new FormData()
			formData.append('file', selectedFile)
			// docPath опционально для обратной совместимости
			if (docPath) {
				formData.append('docPath', docPath)
			}

			const response = await fetch('/api/docs/assets', {
				method: 'POST',
				body: formData,
			})

			if (!response.ok) {
				throw new Error('Failed to upload')
			}

			const data: UploadAssetResponse = await response.json()

			if (data.success) {
				toast.success('Изображение загружено')
				onSelect(data.path, altText || data.filename)
				// Обновляем список
				await loadAssets()
				// Сбрасываем форму
				setSelectedFile(null)
				setAltText('')
			}
		} catch (error) {
			console.error('Error uploading asset:', error)
			toast.error('Не удалось загрузить изображение')
		} finally {
			setIsUploading(false)
		}
	}

	// Drag and drop handlers
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

	return (
		<Tabs defaultValue="library" className="w-full">
			<TabsList className="w-full">
				<TabsTrigger value="library" className="w-full">
					Библиотека
				</TabsTrigger>
				<TabsTrigger value="upload" className="w-full">
					Загрузить
				</TabsTrigger>
			</TabsList>

			<TabsContent value="library" className="mt-4">
				<ScrollArea className="h-[400px] w-full">
					{isLoading ? (
						<div className="flex h-full items-center justify-center">
							<p className="text-muted-foreground">Загрузка...</p>
						</div>
					) : assets.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-2">
							<ImageIcon className="text-muted-foreground size-12" />
							<p className="text-muted-foreground text-sm">Нет изображений</p>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3">
							{assets.map((asset) => (
								<button
									key={asset.filename}
									onClick={() => onSelect(asset.path, asset.filename)}
									className="hover:ring-primary group relative aspect-square overflow-hidden rounded-lg border transition-all hover:ring-2"
								>
									<Image
										src={asset.path}
										alt={asset.filename}
										className="size-full object-cover transition-transform group-hover:scale-105"
										width={100}
										height={100}
									/>
									<div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
										<p className="truncate text-xs text-white">{asset.filename}</p>
									</div>
								</button>
							))}
						</div>
					)}
				</ScrollArea>
			</TabsContent>

			<TabsContent value="upload" className="mt-4">
				<div className="space-y-4">
					{/* Drag and drop area */}
					<div
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
						className={`border-primary/50 flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
							isDragging ? 'bg-primary/10' : 'hover:bg-muted/50'
						}`}
						onClick={() => document.getElementById('file-input')?.click()}
					>
						<UploadIcon className="text-muted-foreground mb-4 size-12" />
						<p className="text-muted-foreground text-sm">Перетащите изображение сюда или кликните для выбора</p>
						{selectedFile && <p className="text-primary mt-2 text-sm font-medium">{selectedFile.name}</p>}
					</div>

					{/* Hidden file input */}
					<Input
						id="file-input"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						onChange={handleFileSelect}
						className="hidden"
					/>

					{/* Preview */}
					{selectedFile && (
						<div className="space-y-4">
							<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
								<Image
									src={URL.createObjectURL(selectedFile)}
									alt="Preview"
									className="size-full object-contain"
									width={100}
									height={100}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="alt-text">Альтернативный текст</Label>
								<Input
									id="alt-text"
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
	)
}
