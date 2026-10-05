'use client'

import { useState } from 'react'

import { toast } from 'sonner'

import { useAuth } from '@/components/providers/AuthProvider'
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
import { deleteGroup } from '@/lib/groups/api'
import { TEACHER_DELETE_NOTE } from '@/lib/groups/group-form'

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
	const { can } = useAuth()
	const zoneAll = can('zone', 'all')
	const [deleting, setDeleting] = useState(false)

	const handleDelete = async () => {
		if (!group) return
		setDeleting(true)
		const outcome = await deleteGroup(group.id)
		setDeleting(false)
		if (!outcome.ok) {
			if (outcome.kind !== 'auth') toast.error('Не удалось удалить группу. Попробуйте ещё раз.')
			return
		}
		onDeleted()
		onOpenChange(false)
	}

	return (
		<AlertDialog open={group !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Удалить группу?</AlertDialogTitle>
					<AlertDialogDescription>
						Группа «{group?.name}» будет удалена. Это действие нельзя отменить.
						{!zoneAll && ` ${TEACHER_DELETE_NOTE}`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleDelete}
						disabled={deleting}
						className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
					>
						{deleting ? 'Удаление...' : 'Удалить'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
