'use client'

import { useState } from 'react'

import { toast } from 'sonner'

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
import { apiFetch } from '@/lib/api-fetch'

interface Group {
	id: string
	name: string
}

interface Props {
	group: Group | null
	onOpenChange: (open: boolean) => void
	onDeleted: () => void
}

export function DeleteGroupDialog({ group, onOpenChange, onDeleted }: Props) {
	const [deleting, setDeleting] = useState(false)

	const handleDelete = async () => {
		if (!group) return
		setDeleting(true)
		try {
			const res = await apiFetch(`/api/groups/${group.id}`, { method: 'DELETE' })
			if (!res.ok) throw new Error()
			onDeleted()
			onOpenChange(false)
		} catch {
			toast.error('Не удалось удалить группу. Попробуйте ещё раз.')
		} finally {
			setDeleting(false)
		}
	}

	return (
		<AlertDialog open={group !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Удалить группу?</AlertDialogTitle>
					<AlertDialogDescription>
						Группа «{group?.name}» будет удалена. Это действие нельзя отменить.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleDelete}
						disabled={deleting}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{deleting ? 'Удаление...' : 'Удалить'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
