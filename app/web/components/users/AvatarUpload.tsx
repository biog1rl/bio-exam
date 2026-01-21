'use client'

import { useState, useRef, useEffect } from 'react'

import { Camera, X } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getAvatarColor, getInitials } from '@/helpers/getAvatarColor'

interface AvatarUploadProps {
	firstName?: string | null
	lastName?: string | null
	avatar?: string | null
	onAvatarChange: (avatar: string | null) => void
	size?: 'sm' | 'md' | 'lg'
	disabled?: boolean
}

const sizeClasses = {
	sm: 'h-16 w-16',
	md: 'h-24 w-24',
	lg: 'h-32 w-32',
}

export function AvatarUpload({
	firstName,
	lastName,
	avatar,
	onAvatarChange,
	size = 'md',
	disabled = false,
}: AvatarUploadProps) {
	const [preview, setPreview] = useState<string | null>(avatar || null)

	// Обновляем превью при изменении avatar prop
	useEffect(() => {
		setPreview(avatar || null)
	}, [avatar])
	const [isUploading, setIsUploading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const initials = getInitials(firstName, lastName)
	const backgroundColor = getAvatarColor(initials || 'User')

	const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return

		// Проверяем тип файла
		if (!file.type.startsWith('image/')) {
			alert('Пожалуйста, выберите изображение')
			return
		}

		// Проверяем размер файла (максимум 5MB)
		if (file.size > 5 * 1024 * 1024) {
			alert('Размер файла не должен превышать 5MB')
			return
		}

		try {
			setIsUploading(true)

			// Создаем FormData для загрузки файла
			const formData = new FormData()
			formData.append('avatar', file)

			// Загружаем файл на сервер
			const response = await fetch('/api/users/upload/avatar', {
				method: 'POST',
				credentials: 'include',
				body: formData,
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Ошибка при загрузке файла')
			}

			const result = await response.json()

			// Обновляем превью и передаем URL аватара
			setPreview(result.avatarUrl)
			onAvatarChange(result.avatarUrl)
		} catch (error) {
			console.error('Error uploading avatar:', error)
			alert(error instanceof Error ? error.message : 'Ошибка при загрузке файла')
		} finally {
			setIsUploading(false)
		}
	}

	const handleRemoveAvatar = () => {
		setPreview(null)
		onAvatarChange(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	const handleClick = () => {
		if (!disabled && !isUploading) {
			fileInputRef.current?.click()
		}
	}

	return (
		<div className="relative inline-block">
			<div className="relative">
				<Avatar
					className={`${sizeClasses[size]} cursor-pointer transition-opacity hover:opacity-80 ${isUploading ? 'opacity-50' : ''}`}
				>
					<AvatarImage src={preview || undefined} alt={`${firstName} ${lastName}`} />
					<AvatarFallback className="font-semibold text-white" style={{ backgroundColor }}>
						{isUploading ? '...' : initials || 'U'}
					</AvatarFallback>
				</Avatar>

				{!disabled && !isUploading && (
					<>
						<Button
							type="button"
							size="icon"
							variant="secondary"
							className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md"
							onClick={handleClick}
						>
							<Camera className="h-4 w-4" />
						</Button>

						{preview && !isUploading && (
							<Button
								type="button"
								size="icon"
								variant="destructive"
								className="absolute -right-1 -top-1 h-6 w-6 rounded-full shadow-md"
								onClick={handleRemoveAvatar}
							>
								<X className="h-3 w-3" />
							</Button>
						)}
					</>
				)}
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={handleFileSelect}
				className="hidden"
				disabled={disabled}
			/>
		</div>
	)
}
