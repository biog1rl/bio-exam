'use client'

import { LogOutIcon, MapIcon, MoreVerticalIcon, UserCircleIcon } from 'lucide-react'
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
import { versionedUrl } from '@/lib/assets/versioned-url'
import { LOGOUT_FAILED_MESSAGE } from '@/lib/session/client'
import { DEFAULT_AVATAR_COLOR, readableTextOn } from '@/lib/utils/readable-text'

export function NavUser() {
	const { isMobile, setOpenMobile } = useSidebar()
	const router = useRouter()
	const { me, logout, avatarVersion } = useAuth()

	// Получаем данные пользователя из AuthProvider или используем переданные
	const displayName = me?.firstName && me?.lastName ? `${me.firstName} ${me.lastName}` : me?.login
	const displayEmail = me?.login
	const avatarRaw = me?.avatarCropped || me?.avatar
	// Добавляем версию для cache-busting, чтобы браузер загружал новое изображение
	const avatar = avatarRaw ? versionedUrl(avatarRaw, avatarVersion) : undefined
	const avatarColor = me?.avatarColor

	const initials = getInitials(me?.firstName, me?.lastName)
	const backgroundColor = avatarColor || DEFAULT_AVATAR_COLOR
	const initialsColor = readableTextOn(backgroundColor)

	const handleLogout = async () => {
		if (!(await logout())) toast.error(LOGOUT_FAILED_MESSAGE)
	}

	const handleProfileClick = () => {
		setOpenMobile(false)
		router.push('/profile')
	}

	const handleSiteMapClick = () => {
		setOpenMobile(false)
		router.push('/sitemap')
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="cursor-pointer transition-all group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:hover:scale-110 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:data-[state=open]:scale-110"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={avatar || undefined} className="rounded-full" />
								<AvatarFallback
									className="rounded-full font-semibold"
									style={{ backgroundColor, color: initialsColor }}
								>
									{initials || displayName?.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{displayName}</span>
								<span className="truncate text-xs text-sidebar-foreground/80">{displayEmail}</span>
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
									<span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem className="cursor-pointer" onClick={handleProfileClick}>
								<UserCircleIcon />
								Профиль
							</DropdownMenuItem>
							<DropdownMenuItem className="cursor-pointer" onClick={handleSiteMapClick}>
								<MapIcon />
								Карта сайта
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer text-destructive hover:bg-destructive data-highlighted:bg-destructive"
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
