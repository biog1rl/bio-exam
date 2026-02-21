'use client'

import { useCallback, useMemo, useState } from 'react'

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

type ConfirmDialogOptions = {
	title: string
	description?: string
	confirmText?: string
	cancelText?: string
	destructive?: boolean
}

type InfoDialogOptions = {
	title: string
	description?: string
	confirmText?: string
}

type DialogState = {
	mode: 'confirm' | 'info'
	title: string
	description?: string
	confirmText: string
	cancelText: string
	destructive: boolean
	resolve: (value: boolean) => void
}

export function useUiAlertDialog() {
	const [dialogState, setDialogState] = useState<DialogState | null>(null)

	const closeDialog = useCallback((value: boolean) => {
		setDialogState((prev) => {
			if (prev) {
				prev.resolve(value)
			}
			return null
		})
	}, [])

	const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
		return new Promise<boolean>((resolve) => {
			setDialogState({
				mode: 'confirm',
				title: options.title,
				description: options.description,
				confirmText: options.confirmText ?? 'Подтвердить',
				cancelText: options.cancelText ?? 'Отмена',
				destructive: options.destructive ?? false,
				resolve,
			})
		})
	}, [])

	const showAlert = useCallback((options: InfoDialogOptions): Promise<void> => {
		return new Promise<void>((resolve) => {
			setDialogState({
				mode: 'info',
				title: options.title,
				description: options.description,
				confirmText: options.confirmText ?? 'Понятно',
				cancelText: '',
				destructive: false,
				resolve: () => resolve(),
			})
		})
	}, [])

	const alertDialog = useMemo(
		() => (
			<AlertDialog
				open={Boolean(dialogState)}
				onOpenChange={(open) => {
					if (!open) {
						closeDialog(false)
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{dialogState?.title}</AlertDialogTitle>
						{dialogState?.description ? <AlertDialogDescription>{dialogState.description}</AlertDialogDescription> : null}
					</AlertDialogHeader>
					<AlertDialogFooter>
						{dialogState?.mode === 'confirm' ? (
							<AlertDialogCancel onClick={() => closeDialog(false)}>{dialogState.cancelText}</AlertDialogCancel>
						) : null}
						<AlertDialogAction
							className={
								dialogState?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined
							}
							onClick={() => closeDialog(true)}
						>
							{dialogState?.confirmText}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		),
		[closeDialog, dialogState]
	)

	return { confirm, showAlert, alertDialog }
}
