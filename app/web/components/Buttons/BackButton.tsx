'use client'

import { useState } from 'react'

import { ArrowLeft } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useUnsavedChanges } from '@/store/unsavedChanges.store'

type Props = {
	className?: string
}

export default function BackButton({ className }: Props) {
	const router = useRouter()
	const pathname = usePathname() || '/'
	const isDirty = useUnsavedChanges((s) => s.isDirty(pathname))
	const clearDirty = useUnsavedChanges((s) => s.clear)
	const [open, setOpen] = useState(false)

	const doNavigate = () => {
		router.back()
	}

	const onClick = () => {
		if (isDirty) {
			setOpen(true)
			return
		}
		doNavigate()
	}

	return (
		<>
			<Button
				size="icon"
				variant="outline"
				className={className ?? 'size-9 cursor-pointer'}
				onClick={onClick}
				aria-label="Назад"
			>
				<ArrowLeft className="size-4" />
			</Button>

			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Есть несохранённые изменения</AlertDialogTitle>
						<AlertDialogDescription>Уйти без сохранения?</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="cursor-pointer">Остаться</AlertDialogCancel>
						<AlertDialogAction
							className="cursor-pointer bg-red-500 text-white hover:bg-red-500/80"
							onClick={() => {
								setOpen(false)
								clearDirty(pathname) // очищаем флаг для текущего пути
								doNavigate()
							}}
						>
							Выйти
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
