'use client'

import { useState, useEffect } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ImageUpload } from '@/components/ui/image-upload'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface AvatarEditorProps {
	firstName?: string | null
	lastName?: string | null
	avatar?: string | null
	avatarCropped?: string | null
	avatarColor?: string | null
	initials?: string | null
	avatarCropX?: number | null
	avatarCropY?: number | null
	avatarCropZoom?: number | null
	avatarCropRotation?: number | null
	avatarCropViewX?: number | null
	avatarCropViewY?: number | null
	onAvatarChange?: (avatar: string | null) => void
	onColorChange: (color: string | null) => void
	onInitialsChange: (initials: string | null) => void
	size?: 'sm' | 'md' | 'lg'
	disabled?: boolean
}

const sizeClasses = {
	sm: 'h-16 w-16',
	md: 'h-24 w-24',
	lg: 'h-32 w-32',
}

const predefinedColors = [
	'#3B82F6', // blue
	'#10B981', // emerald
	'#F59E0B', // amber
	'#EF4444', // red
	'#8B5CF6', // violet
	'#06B6D4', // cyan
	'#84CC16', // lime
	'#F97316', // orange
	'#EC4899', // pink
	'#6B7280', // gray
]

export function AvatarEditor({
	firstName,
	lastName,
	avatar,
	avatarCropped,
	avatarColor,
	initials: propInitials,
	avatarCropZoom,
	avatarCropRotation,
	avatarCropViewX,
	avatarCropViewY,
	onAvatarChange,
	onColorChange,
	onInitialsChange,
	size = 'md',
	disabled = false,
}: AvatarEditorProps) {
	const [initials, setInitials] = useState(propInitials || '')
	const [customColor, setCustomColor] = useState(avatarColor || '#3B82F6')
	const [isOpen, setIsOpen] = useState(false)

	// Обновляем инициалы только при изменении prop (из БД)
	useEffect(() => {
		if (propInitials !== undefined) {
			setInitials(propInitials || '')
		}
	}, [propInitials])

	// Обновляем цвет при изменении prop
	useEffect(() => {
		if (avatarColor) {
			setCustomColor(avatarColor)
		}
	}, [avatarColor])

	const handleInitialsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.toUpperCase()
		setInitials(value)
		onInitialsChange(value || null)
	}

	const handleColorSelect = (color: string) => {
		setCustomColor(color)
		onColorChange(color)
		setIsOpen(false)
	}

	const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const color = e.target.value
		setCustomColor(color)
		onColorChange(color)
	}

	const backgroundColor = avatarColor || customColor

	// Генерируем дефолтные инициалы для отображения, если поле пустое
	const getDisplayInitials = () => {
		if (initials) {
			return initials
		}
		const first = firstName?.charAt(0)?.toUpperCase() || ''
		const last = lastName?.charAt(0)?.toUpperCase() || ''
		return first + last || 'U'
	}

	return (
		<div className="flex flex-col items-center space-y-4">
			{onAvatarChange ? (
				<ImageUpload
					value={avatarCropped || avatar}
					originalSrc={avatar}
					cropZoom={avatarCropZoom}
					cropRotation={avatarCropRotation}
					cropViewX={avatarCropViewX}
					cropViewY={avatarCropViewY}
					onChange={onAvatarChange}
					disabled={disabled}
				/>
			) : (
				<div className="relative">
					<Avatar className={`${sizeClasses[size]} border-2 border-gray-200`}>
						{avatarCropped || avatar ? <AvatarImage src={avatarCropped || avatar || undefined} alt="Avatar" /> : null}
						<AvatarFallback className="font-semibold text-white" style={{ backgroundColor }}>
							{getDisplayInitials()}
						</AvatarFallback>
					</Avatar>
				</div>
			)}

			{!avatarCropped && !avatar && (
				<>
					<div className="space-y-2">
						<Label htmlFor="initials">Инициалы</Label>
						<Input
							id="initials"
							value={initials}
							onChange={handleInitialsChange}
							placeholder="Введите инициалы"
							maxLength={5}
							disabled={disabled}
							className="text-center font-semibold"
						/>
					</div>

					<div className="space-y-2">
						<Label>Цвет аватара</Label>
						<div className="flex items-center space-x-2">
							<Popover open={isOpen} onOpenChange={setIsOpen}>
								<PopoverTrigger asChild>
									<Button type="button" variant="outline" size="sm" disabled={disabled} className="h-10 w-10 p-0">
										<div className="h-6 w-6 rounded border" style={{ backgroundColor }} />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-64">
									<div className="space-y-3">
										<div>
											<Label className="text-sm font-medium">Предустановленные цвета</Label>
											<div className="mt-2 grid grid-cols-5 gap-2">
												{predefinedColors.map((color) => (
													<button
														key={color}
														type="button"
														className="h-8 w-8 rounded border-2 transition-transform hover:scale-110"
														style={{ backgroundColor: color }}
														onClick={() => handleColorSelect(color)}
													/>
												))}
											</div>
										</div>
										<div>
											<Label htmlFor="custom-color" className="text-sm font-medium">
												Пользовательский цвет
											</Label>
											<div className="mt-2 flex items-center space-x-2">
												<Input
													id="custom-color"
													type="color"
													value={customColor}
													onChange={handleCustomColorChange}
													className="h-8 w-12 p-1"
												/>
												<Input
													type="text"
													value={customColor}
													onChange={handleCustomColorChange}
													placeholder="#000000"
													className="flex-1"
												/>
											</div>
										</div>
									</div>
								</PopoverContent>
							</Popover>
							<span className="text-sm text-gray-500">{backgroundColor}</span>
						</div>
					</div>
				</>
			)}
		</div>
	)
}
