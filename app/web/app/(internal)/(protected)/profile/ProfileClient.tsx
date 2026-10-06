'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

import { toast } from 'sonner'
import useSWR from 'swr'

import { PageHeader } from '@/components/page/PageHeader'
import { useAuth } from '@/components/providers/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarEditor } from '@/components/users/AvatarEditor'
import { groupsKeys, myGroupsFetcher } from '@/lib/groups/api'
import { failureMessage } from '@/lib/http/errors'
import { LOGOUT_FAILED_MESSAGE } from '@/lib/session/client'
import { changeOwnPassword, updateOwnProfile } from '@/lib/users/profile-api'

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

function ProfilePanel({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm tab-sm:p-5">
			<h2 className="text-lg font-semibold">{title}</h2>
			{children}
		</section>
	)
}

function FormField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	)
}

export function ProfileClient({ initialData }: ProfileClientProps) {
	const { me, refresh, logout, can } = useAuth()
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

	const canEditAvatar = can('users', 'edit')

	const { data: myGroupsData } = useSWR(groupsKeys.my(), myGroupsFetcher)
	const myGroups = myGroupsData?.groups ?? []

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

			const outcome = await updateOwnProfile({ ...profileData, initials: initialsToSave })
			if (!outcome.ok) {
				const message = failureMessage(outcome, 'Ошибка при сохранении профиля')
				if (message) toast.error(message)
				return
			}

			await refresh()
			toast.success('Профиль успешно обновлен')
		} catch {
			toast.error('Ошибка при сохранении профиля')
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
			const outcome = await changeOwnPassword({
				oldPassword: passwordData.oldPassword,
				newPassword: passwordData.newPassword,
			})
			if (!outcome.ok) {
				const message = failureMessage(outcome, 'Ошибка при смене пароля')
				if (message) toast.error(message)
				return
			}
			toast.success('Пароль успешно изменен', { description: 'На других устройствах нужно войти заново.' })
			setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
		} finally {
			setIsPasswordLoading(false)
		}
	}

	const handleLogout = async () => {
		if (!(await logout())) toast.error(LOGOUT_FAILED_MESSAGE)
	}

	return (
		<div className="space-y-4">
			<PageHeader title="Профиль" />

			<div className="grid gap-4 tab:grid-cols-2">
				{canEditAvatar && (
					<div className="space-y-4">
						<ProfilePanel title="Аватар">
							<div className="flex justify-center rounded-3xl bg-secondary/70 p-unit-mob tab-sm:p-unit">
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

				<div className={`space-y-4 ${!canEditAvatar ? 'max-w-xl tab:col-span-2' : ''}`}>
					<ProfilePanel title="Основная информация">
						<div className="space-y-4">
							<div className="grid gap-4 mob:grid-cols-2">
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
							{myGroups.length > 0 && (
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm text-muted-foreground">Группы</span>
									{myGroups.map((g) => (
										<Badge key={g.id} variant="secondary" className="max-w-full rounded-full">
											<span className="truncate">{g.name}</span>
										</Badge>
									))}
								</div>
							)}
							<Button onClick={handleSaveProfile} disabled={isLoading} className="w-full">
								{isLoading ? 'Сохранение...' : 'Сохранить изменения'}
							</Button>
						</div>
					</ProfilePanel>

					<ProfilePanel title="Смена пароля">
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

					<ProfilePanel title="Выход из аккаунта">
						<Button onClick={handleLogout} variant="destructive" className="w-full">
							Выйти из аккаунта
						</Button>
					</ProfilePanel>
				</div>
			</div>
		</div>
	)
}
