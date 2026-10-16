'use client'

import { OPEN_QUESTION_MAX_POINTS } from '@bio-exam/exam-core'

import { useState } from 'react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { PhotoViewer } from '@/components/tests/answer-photos/PhotoViewer'
import { answerPhotoUrl } from '@/lib/tests/answer-photos-api'
import type { StudentAttemptPhoto } from '@/lib/tests/student-attempt'
import type { AttemptQuestionView } from '@/lib/tests/types'

export function StudentOpenAnswer({
	view,
	photos,
}: {
	view: AttemptQuestionView
	photos: ReadonlyArray<StudentAttemptPhoto>
}) {
	const text = typeof view.userAnswer === 'string' ? view.userAnswer.trim() : ''
	const review = view.review ?? null
	const [viewerIndex, setViewerIndex] = useState<number | null>(null)

	return (
		<div className="mt-4 space-y-3">
			<div className="rounded-2xl border border-border/70 bg-secondary/55 p-4 text-sm">
				<p className="mb-2 font-medium">Ваш ответ</p>
				{text ? (
					<p className="break-words whitespace-pre-wrap">{text}</p>
				) : (
					<p className="text-muted-foreground">Текст не введён</p>
				)}
				{photos.length > 0 ? (
					<ul aria-label="Фото ответа" className="mt-3 flex flex-wrap gap-2">
						{photos.map((photo, index) => (
							<li key={photo.id}>
								<button
									type="button"
									onClick={() => setViewerIndex(index)}
									aria-label={`Открыть фото ${index + 1}`}
									className="block cursor-zoom-in overflow-hidden rounded-xl border border-border/70 focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50 focus-visible:outline-none"
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={answerPhotoUrl(photo.id, 'thumb')} alt="" className="size-24 object-cover" />
								</button>
							</li>
						))}
					</ul>
				) : null}
				<PhotoViewer photos={photos} openIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
			</div>

			{review ? (
				<div className="rounded-2xl border border-border/70 bg-card p-4 text-sm">
					<p className="font-medium">
						Оценка: {review.score} из {OPEN_QUESTION_MAX_POINTS}
					</p>
					{review.comment ? (
						<p className="mt-2 break-words whitespace-pre-wrap">
							<span className="text-muted-foreground">Комментарий проверяющего: </span>
							{review.comment}
						</p>
					) : null}
				</div>
			) : view.status === 'pending' ? (
				<p className="rounded-2xl border border-dashed border-border/70 bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
					Ответ на проверке. Оценка и комментарий появятся после проверки учителем.
				</p>
			) : null}

			{view.referenceText ? (
				<div className="rounded-2xl border border-green-500/40 bg-green-50/80 p-4 text-sm">
					<p className="mb-2 font-medium">Эталонный ответ и критерии</p>
					<MdxRenderer source={view.referenceText} className="prose max-w-none text-sm whitespace-normal" />
				</div>
			) : null}
		</div>
	)
}
