'use client'

import { useState, useEffect } from 'react'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AvatarEditor } from '@/components/users/AvatarEditor'
import { apiFetch, AuthExpiredError } from '@/lib/api-fetch'

interface ProfileData {
	firstName: string | null
	lastName: string | null
	login: string | null
	avatar: string | null
	avatarCropped: string | null
	avatarColor: string | null
	initials: string | null
	avatarCropX: number | null
	avatarCropY: number | null
	avatarCropZoom: number | null
	avatarCropRotation: number | null
	avatarCropViewX: number | null
	avatarCropViewY: number | null
}

interface ProfileClientProps {
	initialData: ProfileData
}

export function ProfileClient({ initialData }: ProfileClientProps) {
	const router = useRouter()
	const { me, refresh } = useAuth()
	const [isLoading, setIsLoading] = useState(false)
	const [isPasswordLoading, setIsPasswordLoading] = useState(false)

	// Состояние формы профиля - используем данные из AuthProvider или initialData
	const [profileData, setProfileData] = useState<ProfileData>(() => {
		if (me) {
			return {
				firstName: me.firstName,
				lastName: me.lastName,
				login: me.login,
				avatar: me.avatar,
				avatarCropped: me.avatarCropped,
				avatarColor: me.avatarColor,
				initials: me.initials,
				avatarCropX: me.avatarCropX,
				avatarCropY: me.avatarCropY,
				avatarCropZoom: me.avatarCropZoom,
				avatarCropRotation: me.avatarCropRotation,
				avatarCropViewX: me.avatarCropViewX,
				avatarCropViewY: me.avatarCropViewY,
			}
		}
		return initialData
	})
	const [passwordData, setPasswordData] = useState({
		oldPassword: '',
		newPassword: '',
		confirmPassword: '',
	})

	const isAdmin = me?.roles?.includes('admin') ?? false

	// Обновляем состояние формы при изменении данных пользователя
	useEffect(() => {
		if (me) {
			setProfileData({
				firstName: me.firstName,
				lastName: me.lastName,
				login: me.login,
				avatar: me.avatar,
				avatarCropped: me.avatarCropped,
				avatarColor: me.avatarColor,
				initials: me.initials,
				avatarCropX: me.avatarCropX,
				avatarCropY: me.avatarCropY,
				avatarCropZoom: me.avatarCropZoom,
				avatarCropRotation: me.avatarCropRotation,
				avatarCropViewX: me.avatarCropViewX,
				avatarCropViewY: me.avatarCropViewY,
			})
		}
	}, [me])

	// Обработка изменения данных профиля
	const handleProfileChange = (field: keyof ProfileData, value: string | null) => {
		setProfileData((prev) => ({ ...prev, [field]: value }))
	}

	// Обработка изменения аватара с автоматическим сохранением
	const handleAvatarChange = async (croppedUrl: string | null) => {
		// Оптимистичное обновление UI с кропнутым изображением
		setProfileData((prev) => ({ ...prev, avatarCropped: croppedUrl }))

		// Уведомляем другие вкладки об изменении аватара
		localStorage.setItem('avatar-changed', Date.now().toString())

		// Обновляем данные с сервера для получения актуальных данных
		await refresh()

		// Удаляем событие через небольшую задержку
		setTimeout(() => {
			localStorage.removeItem('avatar-changed')
		}, 100)
	}

	// Обработка изменения пароля
	const handlePasswordChange = (field: string, value: string) => {
		setPasswordData((prev) => ({ ...prev, [field]: value }))
	}

	// Сохранение профиля
	const handleSaveProfile = async () => {
		setIsLoading(true)
		try {
			// Генерируем дефолтные инициалы, если поле пустое и нет аватара
			let initialsToSave = profileData.initials
			if ((!initialsToSave || initialsToSave.trim() === '') && !profileData.avatar) {
				const first = profileData.firstName?.charAt(0)?.toUpperCase() || ''
				const last = profileData.lastName?.charAt(0)?.toUpperCase() || ''
				initialsToSave = first + last || null
			}

			const dataToSave = {
				...profileData,
				initials: initialsToSave,
			}

			const response = await apiFetch('/api/users/profile', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(dataToSave),
			})

			if (!response.ok) {
				const error = await response.json()
				console.log('API Error:', error)
				throw new Error(error.error || 'Ошибка при сохранении профиля')
			}

			// Обновляем данные в AuthProvider
			await refresh()

			toast.success('Профиль успешно обновлен')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении профиля')
		} finally {
			setIsLoading(false)
		}
	}

	// Смена пароля
	const handleChangePassword = async () => {
		if (passwordData.newPassword !== passwordData.confirmPassword) {
			toast.error('Новые пароли не совпадают')
			return
		}

		if (passwordData.newPassword.length < 5) {
			toast.error('Новый пароль должен содержать минимум 5 символов')
			return
		}

		setIsPasswordLoading(true)
		try {
			const response = await apiFetch('/api/users/profile/password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					oldPassword: passwordData.oldPassword,
					newPassword: passwordData.newPassword,
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Ошибка при смене пароля')
			}

			toast.success('Пароль успешно изменен')
			setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка при смене пароля')
		} finally {
			setIsPasswordLoading(false)
		}
	}

	// Выход из аккаунта
	const handleLogout = async () => {
		try {
			try {
				await apiFetch('/api/auth/logout', {
					method: 'POST',
				})
			} catch (error) {
				if (!(error instanceof AuthExpiredError)) throw error
			}

			// Принудительно обновляем состояние авторизации
			await refresh()

			// Уведомляем другие вкладки о разлогинивании
			localStorage.setItem('logout', Date.now().toString())
			setTimeout(() => {
				localStorage.removeItem('logout')
			}, 100)

			router.push('/login')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка при выходе из аккаунта')
		}
	}

	return (
		<div>
			<h1 className="text-3xl font-bold">Личный кабинет</h1>

			<div className="mt-6 grid gap-6 md:grid-cols-2">
				{/* Левая колонка - аватар (только для администраторов) */}
				{isAdmin && (
					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Аватар</CardTitle>
								<CardDescription>Загрузите фото или настройте инициалы и цвет аватара</CardDescription>
							</CardHeader>
							<CardContent className="flex justify-center">
								<AvatarEditor
									firstName={profileData.firstName}
									lastName={profileData.lastName}
									avatar={profileData.avatar}
									avatarCropped={profileData.avatarCropped}
									avatarColor={profileData.avatarColor}
									initials={profileData.initials}
									avatarCropX={profileData.avatarCropX}
									avatarCropY={profileData.avatarCropY}
									avatarCropZoom={profileData.avatarCropZoom}
									avatarCropRotation={profileData.avatarCropRotation}
									avatarCropViewX={profileData.avatarCropViewX}
									avatarCropViewY={profileData.avatarCropViewY}
									onAvatarChange={handleAvatarChange}
									onColorChange={(color) => handleProfileChange('avatarColor', color)}
									onInitialsChange={(initials) => handleProfileChange('initials', initials)}
									size="lg"
								/>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Правая колонка - форма редактирования */}
				<div className={`space-y-6 ${!isAdmin ? 'max-w-xl md:col-span-2' : ''}`}>
					{/* Основная информация */}
					<Card>
						<CardHeader>
							<CardTitle>Основная информация</CardTitle>
							<CardDescription>Редактируйте свои данные</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="firstName">Имя</Label>
									<Input
										id="firstName"
										value={profileData.firstName || ''}
										onChange={(e) => handleProfileChange('firstName', e.target.value || null)}
										placeholder="Введите имя"
									/>
								</div>
								<div>
									<Label htmlFor="lastName">Фамилия</Label>
									<Input
										id="lastName"
										value={profileData.lastName || ''}
										onChange={(e) => handleProfileChange('lastName', e.target.value || null)}
										placeholder="Введите фамилию"
									/>
								</div>
							</div>
							<div>
								<Label htmlFor="login">Логин</Label>
								<Input
									id="login"
									value={profileData.login || ''}
									onChange={(e) => handleProfileChange('login', e.target.value || null)}
									placeholder="Введите логин"
								/>
							</div>
							<Button onClick={handleSaveProfile} disabled={isLoading} className="w-full">
								{isLoading ? 'Сохранение...' : 'Сохранить изменения'}
							</Button>
						</CardContent>
					</Card>

					{/* Смена пароля */}
					<Card>
						<CardHeader>
							<CardTitle>Безопасность</CardTitle>
							<CardDescription>Смена пароля</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<Label htmlFor="oldPassword">Текущий пароль</Label>
								<Input
									id="oldPassword"
									type="password"
									value={passwordData.oldPassword}
									onChange={(e) => handlePasswordChange('oldPassword', e.target.value)}
									placeholder="Введите текущий пароль"
								/>
							</div>
							<div>
								<Label htmlFor="newPassword">Новый пароль</Label>
								<Input
									id="newPassword"
									type="password"
									value={passwordData.newPassword}
									onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
									placeholder="Введите новый пароль"
								/>
							</div>
							<div>
								<Label htmlFor="confirmPassword">Подтвердите пароль</Label>
								<Input
									id="confirmPassword"
									type="password"
									value={passwordData.confirmPassword}
									onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
									placeholder="Подтвердите новый пароль"
								/>
							</div>
							<Button onClick={handleChangePassword} disabled={isPasswordLoading} className="w-full">
								{isPasswordLoading ? 'Смена пароля...' : 'Сменить пароль'}
							</Button>
						</CardContent>
					</Card>

					{/* Выход из аккаунта */}
					<Card>
						<CardHeader>
							<CardTitle>Выход из аккаунта</CardTitle>
							<CardDescription>Завершить текущую сессию</CardDescription>
						</CardHeader>
						<CardContent>
							<Separator className="my-4" />
							<Button onClick={handleLogout} variant="destructive" className="w-full">
								Выйти из аккаунта
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
