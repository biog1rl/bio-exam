'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

import { Upload, X, Loader2, Pencil } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

import { Avatar, AvatarFallback, AvatarImage } from './avatar'
import { Button } from './button'
import { ImageCropDialog } from './image-crop-dialog'

interface ImageUploadProps {
	value?: string | null
	originalSrc?: string | null
	onChange: (url: string | null) => void | Promise<void>
	disabled?: boolean
	maxSize?: number
	className?: string
	cropZoom?: number | null
	cropRotation?: number | null
	cropViewX?: number | null
	cropViewY?: number | null
}

export function ImageUpload({
	value,
	originalSrc,
	onChange,
	disabled = false,
	maxSize = 5 * 1024 * 1024,
	className,
	cropZoom,
	cropRotation,
	cropViewX,
	cropViewY,
}: ImageUploadProps) {
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [imageSrcForCrop, setImageSrcForCrop] = useState<string | null>(null)
	const [isCropDialogOpen, setIsCropDialogOpen] = useState(false)
	const [isTemporaryUrl, setIsTemporaryUrl] = useState(false)
	const [imageKey, setImageKey] = useState(Date.now())
	const inputRef = useRef<HTMLInputElement>(null)

	// Временные параметры кропа, сохраняются между открытиями модалки
	const [tempCropParams, setTempCropParams] = useState<{
		x: number
		y: number
		width: number
		height: number
		zoom: number
		rotation: number
		viewX?: number
		viewY?: number
	} | null>(null)

	// Ref для отслеживания предыдущих значений props
	const prevPropsRef = useRef({ cropViewX, cropViewY, cropZoom, cropRotation })

	// Очищаем tempCropParams когда props обновляются с сервера
	useEffect(() => {
		const prev = prevPropsRef.current
		const hasChanged =
			prev.cropViewX !== cropViewX ||
			prev.cropViewY !== cropViewY ||
			prev.cropZoom !== cropZoom ||
			prev.cropRotation !== cropRotation

		if (hasChanged && tempCropParams) {
			// Проверяем что новые значения отличаются от временных
			const isDifferentFromTemp =
				tempCropParams.viewX !== cropViewX ||
				tempCropParams.viewY !== cropViewY ||
				tempCropParams.zoom !== cropZoom ||
				tempCropParams.rotation !== cropRotation

			if (isDifferentFromTemp) {
				setTempCropParams(null)
			}
		}

		prevPropsRef.current = { cropViewX, cropViewY, cropZoom, cropRotation }
	}, [cropViewX, cropViewY, cropZoom, cropRotation, tempCropParams])

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// Проверка типа файла
		if (!file.type.startsWith('image/')) {
			setError('Можно загружать только изображения')
			return
		}

		// Проверка размера файла
		if (file.size > maxSize) {
			setError(`Размер файла не должен превышать ${Math.round(maxSize / 1024 / 1024)}MB`)
			return
		}

		setError(null)

		// Создаем URL для предпросмотра
		const imageUrl = URL.createObjectURL(file)
		setImageSrcForCrop(imageUrl)
		setIsTemporaryUrl(true)
		setTempCropParams(null) // Очищаем временные параметры для нового изображения
		setIsCropDialogOpen(true)
	}

	const handleCropComplete = async (cropParams: {
		x: number
		y: number
		width: number
		height: number
		zoom: number
		rotation: number
		viewX?: number
		viewY?: number
	}) => {
		setIsUploading(true)

		try {
			// Получаем оригинальный файл из input
			const file = inputRef.current?.files?.[0]
			if (!file && isTemporaryUrl) {
				throw new Error('Файл не найден')
			}

			const formData = new FormData()
			if (file) {
				// Новая загрузка - отправляем оригинальный файл
				formData.append('avatar', file)
			}
			// Добавляем параметры кропа
			formData.append('cropX', cropParams.x.toString())
			formData.append('cropY', cropParams.y.toString())
			formData.append('cropWidth', cropParams.width.toString())
			formData.append('cropHeight', cropParams.height.toString())
			formData.append('cropZoom', cropParams.zoom.toString())
			formData.append('cropRotation', cropParams.rotation.toString())
			if (cropParams.viewX !== undefined) formData.append('cropViewX', cropParams.viewX.toString())
			if (cropParams.viewY !== undefined) formData.append('cropViewY', cropParams.viewY.toString())

			const response = await fetch('/api/users/avatar', {
				method: 'POST',
				body: formData,
				credentials: 'include',
			})

			if (!response.ok) {
				const data = await response.json()
				throw new Error(data.error || 'Ошибка загрузки')
			}

			const data = await response.json()

			// Используем кропнутое изображение, если оно есть, иначе оригинальное
			await onChange(data.avatarCroppedUrl || data.avatarUrl)

			// Обновляем ключ для принудительного обновления изображения
			setImageKey(Date.now())

			// Очищаем временный URL только если это был временный объект
			if (imageSrcForCrop && isTemporaryUrl) {
				URL.revokeObjectURL(imageSrcForCrop)
			}
			setImageSrcForCrop(null)
			setIsTemporaryUrl(false)

			// НЕ очищаем временные параметры - они будут использоваться до обновления props с сервера
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Ошибка загрузки файла')
		} finally {
			setIsUploading(false)
			if (inputRef.current) {
				inputRef.current.value = ''
			}
		}
	}

	const handleRemove = async () => {
		if (!value) return

		setIsUploading(true)
		setError(null)

		try {
			const response = await fetch('/api/users/avatar', {
				method: 'DELETE',
				credentials: 'include',
			})

			if (!response.ok) {
				const data = await response.json()
				throw new Error(data.error || 'Ошибка удаления')
			}

			await onChange(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Ошибка удаления файла')
		} finally {
			setIsUploading(false)
		}
	}

	const handleEdit = () => {
		if (!value) return
		// Используем оригинальное изображение для редактирования, если оно есть
		setImageSrcForCrop(originalSrc || value)
		setIsTemporaryUrl(false)
		setIsCropDialogOpen(true)
	}

	// Восстанавливаем позицию кропа при редактировании
	// Сначала пробуем использовать временные параметры, если их нет - используем сохраненные из БД
	const initialCropParams = (() => {
		if (tempCropParams) {
			return tempCropParams
		}

		// Из БД восстанавливаем viewX/viewY вместо x/y
		if (
			cropViewX !== null &&
			cropViewX !== undefined &&
			cropViewY !== null &&
			cropViewY !== undefined &&
			cropZoom !== null &&
			cropZoom !== undefined &&
			cropRotation !== null &&
			cropRotation !== undefined
		) {
			return {
				x: 0, // не используется
				y: 0, // не используется
				width: 0,
				height: 0,
				zoom: cropZoom,
				rotation: cropRotation,
				viewX: cropViewX,
				viewY: cropViewY,
			}
		}

		return undefined
	})()

	const handleCropParamsChange = useCallback(
		(cropParams: {
			x: number
			y: number
			width: number
			height: number
			zoom: number
			rotation: number
			viewX?: number
			viewY?: number
		}) => {
			setTempCropParams(cropParams)
		},
		[]
	)

	const handleCropDialogClose = (open: boolean) => {
		setIsCropDialogOpen(open)
		if (!open && imageSrcForCrop && isTemporaryUrl) {
			URL.revokeObjectURL(imageSrcForCrop)
			setImageSrcForCrop(null)
			setIsTemporaryUrl(false)
		}
	}

	return (
		<>
			<div className={cn('flex flex-col items-center space-y-4', className)}>
				{value ? (
					<div className="group relative">
						<Avatar className="h-32 w-32" key={imageKey}>
							<AvatarImage src={`${value}?v=${imageKey}`} alt="Avatar" />
							<AvatarFallback>Avatar</AvatarFallback>
						</Avatar>
						{!disabled && (
							<>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									className="absolute -right-2 -top-2 h-8 w-8 rounded-full p-0"
									onClick={handleRemove}
									disabled={isUploading}
								>
									{isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="absolute bottom-0 left-1/2 h-8 w-8 -translate-x-1/2 translate-y-1/2 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
									onClick={handleEdit}
									disabled={isUploading}
								>
									<Pencil className="h-4 w-4" />
								</Button>
							</>
						)}
					</div>
				) : (
					<div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-gray-50">
						{isUploading ? (
							<Loader2 className="h-8 w-8 animate-spin text-gray-400" />
						) : (
							<Upload className="h-8 w-8 text-gray-400" />
						)}
					</div>
				)}

				{!disabled && !value && (
					<>
						<input
							ref={inputRef}
							type="file"
							accept="image/*"
							onChange={handleFileChange}
							disabled={isUploading}
							className="hidden"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => inputRef.current?.click()}
							disabled={isUploading}
						>
							Загрузить фото
						</Button>
					</>
				)}

				{error && <p className="text-sm text-red-500">{error}</p>}
			</div>

			{imageSrcForCrop && (
				<ImageCropDialog
					open={isCropDialogOpen}
					onOpenChange={handleCropDialogClose}
					imageSrc={imageSrcForCrop}
					initialCrop={!isTemporaryUrl ? initialCropParams : undefined}
					onCropComplete={handleCropComplete}
					onCropParamsChange={handleCropParamsChange}
				/>
			)}
		</>
	)
}
