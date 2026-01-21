'use client'

import { cn } from '@/lib/utils/cn'

interface CroppedAvatarProps {
	src: string
	cropX?: number | null
	cropY?: number | null
	cropZoom?: number | null
	cropRotation?: number | null
	className?: string
	alt?: string
}

export function CroppedAvatar({
	src,
	cropX,
	cropY,
	cropZoom,
	cropRotation,
	className,
	alt = 'Avatar',
}: CroppedAvatarProps) {
	// Если нет параметров кропа, показываем изображение как есть
	if (cropX === null || cropX === undefined || cropY === null || cropY === undefined) {
		return (
			<img
				src={src}
				alt={alt}
				className={cn('h-32 w-32 rounded-full border-2 border-gray-200 object-cover', className)}
			/>
		)
	}

	const zoom = cropZoom || 1
	const rotation = cropRotation || 0

	// Размер контейнера в пикселях (132px = 128px + 4px border)
	const containerSize = 128

	// Вычисляем размер изображения с учетом зума
	const imageSize = containerSize / zoom

	// Преобразуем проценты в пиксели для позиционирования
	// react-easy-crop возвращает координаты центра кропа в процентах
	const translateX = -cropX * (imageSize / 100)
	const translateY = -cropY * (imageSize / 100)

	return (
		<div className={cn('relative h-32 w-32 overflow-hidden rounded-full border-2 border-gray-200', className)}>
			<div
				className="absolute"
				style={{
					width: `${imageSize}px`,
					height: `${imageSize}px`,
					left: '50%',
					top: '50%',
					transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) rotate(${rotation}deg)`,
				}}
			>
				<img src={src} alt={alt} className="h-full w-full object-cover" />
			</div>
		</div>
	)
}
