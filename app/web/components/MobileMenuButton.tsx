'use client'

import { MenuIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'

export function MobileMenuButton() {
	const { openMobile, setOpenMobile } = useSidebar()

	return (
		<Button
			size="icon"
			variant="outline"
			className="rounded-full bg-card hover:bg-accent tab:hidden"
			onClick={() => setOpenMobile(true)}
			aria-label="Открыть меню"
			aria-haspopup="dialog"
			aria-expanded={openMobile}
		>
			<MenuIcon className="size-4" aria-hidden="true" />
		</Button>
	)
}
