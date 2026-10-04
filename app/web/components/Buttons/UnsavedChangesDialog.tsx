'use client'

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
import { UNSAVED_CHANGES_TEXT } from '@/lib/drafts/draft-ui'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	description: string
	onLeave: () => void
}

export function UnsavedChangesDialog({ open, onOpenChange, description, onLeave }: Props) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{UNSAVED_CHANGES_TEXT.title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="cursor-pointer">{UNSAVED_CHANGES_TEXT.stay}</AlertDialogCancel>
					<AlertDialogAction
						className="cursor-pointer bg-red-500 text-white hover:bg-red-500/80"
						onClick={() => {
							onOpenChange(false)
							onLeave()
						}}
					>
						{UNSAVED_CHANGES_TEXT.leave}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
