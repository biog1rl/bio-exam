'use client'

import { LogOutIcon, MoreVerticalIcon, UserCircleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useAuth } from '@/components/providers/AuthProvider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { getInitials } from '@/helpers/getAvatarColor'

export function NavUser() {
	const { isMobile } = useSidebar()
	const router = useRouter()
	const { me, refresh, avatarVersion } = useAuth()

	// Получаем данные пользователя из AuthProvider или используем переданные
	const displayName = me?.firstName && me?.lastName ? `${me.firstName} ${me.lastName}` : me?.login
	const displayEmail = me?.login
	const avatarRaw = me?.avatarCropped || me?.avatar
	// Добавляем версию для cache-busting, чтобы браузер загружал новое изображение
	const avatar = avatarRaw ? `${avatarRaw}?v=${avatarVersion}` : undefined
	const avatarColor = me?.avatarColor

	const initials = getInitials(me?.firstName, me?.lastName)
	const backgroundColor = avatarColor || '#3B82F6'

	const handleLogout = async () => {
		try {
			await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include',
			})

			// Принудительно обновляем состояние авторизации
			await refresh()

			// Уведомляем другие вкладки о разлогинивании
			localStorage.setItem('logout', Date.now().toString())
			setTimeout(() => {
				localStorage.removeItem('logout')
			}, 100)

			router.push('/login')
			toast.success('Вы вышли из аккаунта')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Ошибка при выходе из аккаунта')
		}
	}

	const handleProfileClick = () => {
		router.push('/profile')
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer transition-all group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:hover:scale-110 group-data-[collapsible=icon]:data-[state=open]:scale-110"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={avatar || undefined} className="rounded-full" />
								<AvatarFallback className="rounded-full font-semibold text-white" style={{ backgroundColor }}>
									{initials || displayName?.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{displayName}</span>
								<span className="text-muted-foreground truncate text-xs">{displayEmail}</span>
							</div>
							<MoreVerticalIcon className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
						side={isMobile ? 'bottom' : 'right'}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{displayName}</span>
									<span className="text-muted-foreground truncate text-xs">{displayEmail}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem className="cursor-pointer" onClick={handleProfileClick}>
								<UserCircleIcon />
								Профиль
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="data-highlighted:bg-destructive text-destructive hover:bg-destructive cursor-pointer"
							onClick={handleLogout}
						>
							<LogOutIcon />
							Выйти
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
