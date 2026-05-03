'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import useSWR from 'swr'

import { useAuth } from '@/components/providers/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarEditor } from '@/components/users/AvatarEditor'
import { apiFetch, AuthExpiredError } from '@/lib/api-fetch'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

function ProfilePanel({
	title,
	kicker,
	description,
	children,
	className = '',
}: {
	title: string
	kicker: string
	description?: string
	children: ReactNode
	className?: string
}) {
	return (
		<Card className={`rounded-4xl border-border/80 bg-card/90 ${className}`}>
			<CardHeader>
				<p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.22em]">{kicker}</p>
				<CardTitle className="font-serif text-2xl leading-tight">{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	)
}

function FormField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id} className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.16em]">
				{label}
			</Label>
			{children}
		</div>
	)
}

export function ProfileClient({ initialData }: ProfileClientProps) {
	const router = useRouter()
	const { me, refresh } = useAuth()
	const [isLoading, setIsLoading] = useState(false)
	const [isPasswordLoading, setIsPasswordLoading] = useState(false)

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

	const { data: myGroupData } = useSWR<{ group: { id: string; name: string } | null }>('/api/groups/my', fetcher)
	const myGroup = myGroupData?.group ?? null

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

	const handleProfileChange = (field: keyof ProfileData, value: string | null) => {
		setProfileData((prev) => ({ ...prev, [field]: value }))
	}

	const handleAvatarChange = async (croppedUrl: string | null) => {
		setProfileData((prev) => ({ ...prev, avatarCropped: croppedUrl }))
		localStorage.setItem('avatar-changed', Date.now().toString())
		await refresh()
		setTimeout(() => {
			localStorage.removeItem('avatar-changed')
		}, 100)
	}

	const handlePasswordChange = (field: string, value: string) => {
		setPasswordData((prev) => ({ ...prev, [field]: value }))
	}

	const handleSaveProfile = async () => {
		setIsLoading(true)
		try {
			let initialsToSave = profileData.initials
			if ((!initialsToSave || initialsToSave.trim() === '') && !profileData.avatar) {
				const first = profileData.firstName?.charAt(0)?.toUpperCase() || ''
				const last = profileData.lastName?.charAt(0)?.toUpperCase() || ''
				initialsToSave = first + last || null
			}

			const response = await apiFetch('/api/users/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...profileData, initials: initialsToSave }),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Ошибка при сохранении профиля')
			}

			await refresh()
			toast.success('Профиль успешно обновлен')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении профиля')
		} finally {
			setIsLoading(false)
		}
	}

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
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ oldPassword: passwordData.oldPassword, newPassword: passwordData.newPassword }),
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

	const handleLogout = async () => {
		try {
			try {
				await apiFetch('/api/auth/logout', { method: 'POST' })
			} catch (error) {
				if (!(error instanceof AuthExpiredError)) throw error
			}
			await refresh()
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
		<div className="space-y-6">
			<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
				<p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.22em]">профиль</p>
				<h1 className="text-foreground tab-sm:text-5xl mt-2 font-serif text-4xl leading-none">Личный кабинет</h1>
				<p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
					Настройте публичные данные, аватар и параметры доступа к аккаунту.
				</p>
			</section>

			<div className="grid gap-6 md:grid-cols-2">
				{isAdmin && (
					<div className="space-y-6">
						<ProfilePanel
							kicker="визуальный маркер"
							title="Аватар"
							description="Загрузите фото или настройте инициалы и цвет аватара"
						>
							<div className="bg-secondary/70 p-unit-mob tab-sm:p-unit flex justify-center rounded-3xl">
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
							</div>
						</ProfilePanel>
					</div>
				)}

				<div className={`space-y-6 ${!isAdmin ? 'max-w-xl md:col-span-2' : ''}`}>
					<ProfilePanel kicker="данные" title="Основная информация" description="Редактируйте свои данные">
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<FormField id="firstName" label="Имя">
									<Input
										id="firstName"
										value={profileData.firstName || ''}
										onChange={(e) => handleProfileChange('firstName', e.target.value || null)}
										placeholder="Введите имя"
									/>
								</FormField>
								<FormField id="lastName" label="Фамилия">
									<Input
										id="lastName"
										value={profileData.lastName || ''}
										onChange={(e) => handleProfileChange('lastName', e.target.value || null)}
										placeholder="Введите фамилию"
									/>
								</FormField>
							</div>
							<FormField id="login" label="Логин">
								<Input
									id="login"
									value={profileData.login || ''}
									onChange={(e) => handleProfileChange('login', e.target.value || null)}
									placeholder="Введите логин"
								/>
							</FormField>
							{myGroup && (
								<div className="bg-secondary/70 flex items-center gap-2 rounded-3xl px-4 py-3">
									<span className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.16em]">
										Группа
									</span>
									<Badge variant="secondary" className="rounded-full">
										{myGroup.name}
									</Badge>
								</div>
							)}
							<Button onClick={handleSaveProfile} disabled={isLoading} className="w-full">
								{isLoading ? 'Сохранение...' : 'Сохранить изменения'}
							</Button>
						</div>
					</ProfilePanel>

					<ProfilePanel kicker="доступ" title="Безопасность" description="Смена пароля">
						<div className="space-y-4">
							<FormField id="oldPassword" label="Текущий пароль">
								<Input
									id="oldPassword"
									type="password"
									value={passwordData.oldPassword}
									onChange={(e) => handlePasswordChange('oldPassword', e.target.value)}
									placeholder="Введите текущий пароль"
								/>
							</FormField>
							<FormField id="newPassword" label="Новый пароль">
								<Input
									id="newPassword"
									type="password"
									value={passwordData.newPassword}
									onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
									placeholder="Введите новый пароль"
								/>
							</FormField>
							<FormField id="confirmPassword" label="Подтвердите пароль">
								<Input
									id="confirmPassword"
									type="password"
									value={passwordData.confirmPassword}
									onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
									placeholder="Подтвердите новый пароль"
								/>
							</FormField>
							<Button onClick={handleChangePassword} disabled={isPasswordLoading} className="w-full">
								{isPasswordLoading ? 'Смена пароля...' : 'Сменить пароль'}
							</Button>
						</div>
					</ProfilePanel>

					<ProfilePanel kicker="сессия" title="Выход из аккаунта" description="Завершить текущую сессию">
						<div className="bg-secondary/60 p-unit-mob rounded-3xl">
							<Button onClick={handleLogout} variant="destructive" className="w-full">
								Выйти из аккаунта
							</Button>
						</div>
					</ProfilePanel>
				</div>
			</div>
		</div>
	)
}
