'use client'

import { UploadWindowRefusalSchema } from '@bio-exam/exam-core'

import { useState, useSyncExternalStore } from 'react'

import { Loader2 } from 'lucide-react'

import { useUploadWindowView } from '@/components/tests/attempt-result/UploadWindowLine'
import { Button } from '@/components/ui/button'
import { failureMessage } from '@/lib/http/errors'
import { completeAnswerUploads } from '@/lib/tests/answer-photos-api'

import { PhotoBlock, type PhotoSource } from './PhotoBlock'
import type { AnswerPhotoQueueHandle } from './use-answer-photos'

const DONE_FAILED_TEXT = 'Не удалось завершить загрузку. Повторите попытку.'

type Props = {
	photos: AnswerPhotoQueueHandle
	uploadClosesAt: string | null
	serverOffsetMs: number
	sources: readonly PhotoSource[]
	onUploadsDone: (uploadClosesAt: string | null) => void
}

export function SubmittedPhotos({ photos, uploadClosesAt, serverOffsetMs, sources, onUploadsDone }: Props) {
	const { queue, target } = photos
	const view = useUploadWindowView(uploadClosesAt, serverOffsetMs)
	const state = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const busy = state.items.some(
		(item) => item.status === 'preparing' || item.status === 'uploading' || item.status === 'retrying'
	)

	if (view.state === 'none' || view.state === 'closed') return null

	const finish = async () => {
		setSaving(true)
		setError(null)
		const outcome = await completeAnswerUploads(target)
		setSaving(false)
		if (outcome.ok) {
			onUploadsDone(outcome.data.uploadClosesAt)
			return
		}
		const refusal = UploadWindowRefusalSchema.safeParse(outcome.body)
		if (refusal.success) {
			onUploadsDone(refusal.data.uploadClosesAt)
			return
		}
		setError(failureMessage(outcome) || DONE_FAILED_TEXT)
	}

	return (
		<div className="space-y-3">
			<PhotoBlock photos={photos} disabled={saving} sources={sources} />
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<Button type="button" className="h-11 w-full mob:w-auto tab:h-9" disabled={busy || saving} onClick={finish}>
					{saving ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
					Готово, фото загружены
				</Button>
				<p className="text-xs text-muted-foreground">
					После нажатия окно загрузки закроется, и работа сразу попадёт к проверяющему.
				</p>
			</div>
			{error ? (
				<p role="alert" className="text-sm break-words text-destructive">
					{error}
				</p>
			) : null}
		</div>
	)
}
