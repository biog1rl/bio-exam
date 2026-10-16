'use client'

import { useRef, useState } from 'react'

import { ArrowLeft, Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

import { UnsavedChangesDialog } from '@/components/Buttons/UnsavedChangesDialog'
import { Button } from '@/components/ui/button'
import { UNSAVED_CHANGES_TEXT } from '@/lib/drafts/draft-ui'
import { goBack } from '@/lib/navigation/go-back'
import { type LeaveDecision, useUnsavedChanges } from '@/store/unsavedChanges.store'

export default function BackButton() {
	const router = useRouter()
	const pathname = usePathname() || '/'
	const leave = useUnsavedChanges((s) => s.leave)
	const clearUnsaved = useUnsavedChanges((s) => s.clear)
	const isLeaving = useUnsavedChanges((s) => !!s.leavingByPath[pathname])
	const [open, setOpen] = useState(false)
	const [description, setDescription] = useState(UNSAVED_CHANGES_TEXT.description)
	const handledLeaveRef = useRef<Promise<LeaveDecision> | null>(null)

	const onClick = async () => {
		const pending = leave(pathname)
		if (handledLeaveRef.current === pending) return
		handledLeaveRef.current = pending
		try {
			const decision = await pending
			if (decision.kind === 'navigate') {
				goBack(router, pathname)
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
				className="rounded-full bg-card hover:bg-accent"
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
					goBack(router, pathname)
				}}
			/>
		</>
	)
}
