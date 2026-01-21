'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'
import { Label } from './label'
import { Slider } from './slider'

interface CropParams {
	x: number
	y: number
	width: number
	height: number
	zoom: number
	rotation: number
	viewX?: number
	viewY?: number
}

interface ImageCropDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	imageSrc: string
	initialCrop?: CropParams
	onCropComplete: (cropParams: CropParams) => void
	onCropParamsChange?: (cropParams: CropParams) => void
}

export function ImageCropDialog({
	open,
	onOpenChange,
	imageSrc,
	initialCrop,
	onCropComplete,
	onCropParamsChange,
}: ImageCropDialogProps) {
	const [crop, setCrop] = useState(initialCrop ? { x: initialCrop.x, y: initialCrop.y } : { x: 0, y: 0 })
	const [zoom, setZoom] = useState(initialCrop?.zoom || 1)
	const [rotation, setRotation] = useState(initialCrop?.rotation || 0)
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)

	// Используем ref для доступа к актуальному initialCrop внутри useEffect без добавления его в зависимости
	const initialCropRef = useRef(initialCrop)
	useEffect(() => {
		initialCropRef.current = initialCrop
	}, [initialCrop])

	// Используем ref для callback чтобы избежать бесконечного цикла
	const onCropParamsChangeRef = useRef(onCropParamsChange)
	useEffect(() => {
		onCropParamsChangeRef.current = onCropParamsChange
	}, [onCropParamsChange])

	// Сбрасываем состояние при открытии диалога
	useEffect(() => {
		if (open) {
			const init = initialCropRef.current
			// Используем viewX/viewY если есть, иначе x/y (для обратной совместимости)
			const cropPos = init
				? {
						x: init.viewX !== undefined ? init.viewX : init.x,
						y: init.viewY !== undefined ? init.viewY : init.y,
					}
				: { x: 0, y: 0 }
			const zoomVal = init?.zoom || 1
			const rotationVal = init?.rotation || 0

			setCrop(cropPos)
			setZoom(zoomVal)
			setRotation(rotationVal)
		}
	}, [open])

	// Уведомляем родительский компонент об изменениях параметров
	useEffect(() => {
		if (open && croppedAreaPixels && onCropParamsChangeRef.current) {
			const params = {
				x: croppedAreaPixels.x,
				y: croppedAreaPixels.y,
				width: croppedAreaPixels.width,
				height: croppedAreaPixels.height,
				zoom,
				rotation,
				viewX: crop.x,
				viewY: crop.y,
			}
			onCropParamsChangeRef.current(params)
		}
	}, [open, crop, zoom, rotation, croppedAreaPixels])

	const onCropChange = (location: { x: number; y: number }) => {
		setCrop(location)
	}

	const onZoomChange = (newZoom: number) => {
		setZoom(newZoom)
	}

	const onRotationChange = (newRotation: number[]) => {
		setRotation(newRotation[0])
	}

	const onCropAreaChange = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
		setCroppedAreaPixels(croppedAreaPixels)
	}, [])

	const handleSave = () => {
		setIsProcessing(true)
		try {
			if (!croppedAreaPixels) {
				console.error('No cropped area available')
				return
			}

			// Отправляем параметры области кропа в пикселях и координаты view
			onCropComplete({
				x: croppedAreaPixels.x,
				y: croppedAreaPixels.y,
				width: croppedAreaPixels.width,
				height: croppedAreaPixels.height,
				zoom,
				rotation,
				viewX: crop.x,
				viewY: crop.y,
			})
			onOpenChange(false)
		} catch (error) {
			console.error('Error saving crop params:', error)
		} finally {
			setIsProcessing(false)
		}
	}

	const handleCancel = () => {
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Редактировать фото</DialogTitle>
					<DialogDescription>Настройте положение, размер и поворот изображения</DialogDescription>
				</DialogHeader>

				<div className="relative h-96 w-full bg-gray-100">
					<Cropper
						image={imageSrc}
						crop={crop}
						zoom={zoom}
						rotation={rotation}
						aspect={1}
						cropShape="round"
						showGrid={false}
						onCropChange={onCropChange}
						onZoomChange={onZoomChange}
						onCropComplete={onCropAreaChange}
					/>
				</div>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="zoom">Масштаб</Label>
						<Slider id="zoom" min={1} max={3} step={0.1} value={[zoom]} onValueChange={(value) => setZoom(value[0])} />
					</div>

					<div className="space-y-2">
						<Label htmlFor="rotation">Поворот</Label>
						<Slider id="rotation" min={0} max={360} step={1} value={[rotation]} onValueChange={onRotationChange} />
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={handleCancel} disabled={isProcessing}>
						Отмена
					</Button>
					<Button type="button" onClick={handleSave} disabled={isProcessing}>
						{isProcessing ? 'Обработка...' : 'Сохранить'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
