'use client'

import { useRef, useState } from 'react'

import { ArrowLeft, Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import { UnsavedChangesDialog } from '@/components/Buttons/UnsavedChangesDialog'
import { Button } from '@/components/ui/button'
import { UNSAVED_CHANGES_TEXT } from '@/lib/drafts/draft-ui'
import { backAction } from '@/lib/navigation/paths'
import { type LeaveDecision, useUnsavedChanges } from '@/store/unsavedChanges.store'

type Props = {
	className?: string
}

function canGoBack(): boolean {
	const navigation = (window as { navigation?: { canGoBack?: boolean } }).navigation
	return navigation?.canGoBack ?? window.history.length > 1
}

export default function BackButton({ className }: Props) {
	const router = useRouter()
	const pathname = usePathname() || '/'
	const leave = useUnsavedChanges((s) => s.leave)
	const clearUnsaved = useUnsavedChanges((s) => s.clear)
	const isLeaving = useUnsavedChanges((s) => !!s.leavingByPath[pathname])
	const [open, setOpen] = useState(false)
	const [description, setDescription] = useState(UNSAVED_CHANGES_TEXT.description)
	const handledLeaveRef = useRef<Promise<LeaveDecision> | null>(null)

	const goBack = () => {
		const action = backAction(pathname, canGoBack())
		if (action.kind === 'history') router.back()
		else router.push(action.href)
	}

	const onClick = async () => {
		const pending = leave(pathname)
		if (handledLeaveRef.current === pending) return
		handledLeaveRef.current = pending
		try {
			const decision = await pending
			if (decision.kind === 'navigate') {
				goBack()
				return
			}
			setDescription(decision.description)
			setOpen(true)
		} finally {
			if (handledLeaveRef.current === pending) handledLeaveRef.current = null
		}
	}

	return (
		<>
			<Button
				size="icon"
				variant="outline"
				className={className ?? 'size-9 cursor-pointer'}
				onClick={() => void onClick()}
				aria-label="Назад"
				aria-busy={isLeaving}
			>
				{isLeaving ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4" />}
			</Button>

			<UnsavedChangesDialog
				open={open}
				onOpenChange={setOpen}
				description={description}
				onLeave={() => {
					clearUnsaved(pathname)
					goBack()
				}}
			/>
		</>
	)
}
