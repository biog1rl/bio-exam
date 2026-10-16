'use client'

import { useMemo } from 'react'

import { useAnswerPhotos, type AnswerPhotoQueueHandle } from '@/components/tests/answer-photos/use-answer-photos'
import type { AttemptQuestionView } from '@/lib/tests/types'

import { StudentOpenAnswer } from './StudentOpenAnswer'

export function QueuedOpenAnswer({ handle, view }: { handle: AnswerPhotoQueueHandle; view: AttemptQuestionView }) {
	const { state } = useAnswerPhotos(handle)
	const photos = useMemo(
		() =>
			state.items.flatMap((item) =>
				item.status === 'done' && item.photo ? [{ id: item.photo.id, uploadedAt: item.photo.uploadedAt }] : []
			),
		[state.items]
	)
	return <StudentOpenAnswer view={view} photos={photos} />
}
