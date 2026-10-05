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
			className="size-9 cursor-pointer border-border bg-card text-foreground transition-colors hover:bg-secondary tab:hidden"
			onClick={() => setOpenMobile(true)}
			aria-label="Открыть меню"
			aria-haspopup="dialog"
			aria-expanded={openMobile}
		>
			<MenuIcon className="size-4" aria-hidden="true" />
		</Button>
	)
}
