'use client'

import type { AttemptQuestionView } from '@bio-exam/exam-core'

import { useState } from 'react'

import { Loader2 } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { answerPhotoUrl } from '@/lib/tests/answer-photos-api'
import { saveOpenReview } from '@/lib/tests/open-review-api'
import type { AttemptReviewData } from '@/lib/tests/types'
import { formatDateTime } from '@/lib/utils/dates'

import {
	OPEN_REVIEW_COMMENT_MAX_LENGTH,
	OPEN_REVIEW_SCORES,
	canSaveReview,
	initialReviewForm,
	isNoAnswerReview,
	reviewErrorText,
	reviewWindowHint,
	type OpenReviewForm,
} from './open-review'

type Props = {
	attempt: AttemptReviewData
	view: AttemptQuestionView
	onSaved: () => void
}

export function OpenAnswerReview({ attempt, view, onSaved }: Props) {
	const open = view.open
	const [form, setForm] = useState<OpenReviewForm>(() => initialReviewForm(open?.review ?? null))
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [nowMs] = useState(() => Date.now())

	if (!open) return null

	const ready = attempt.reviewReady !== false
	const saved = initialReviewForm(open.review)
	const hint = ready ? null : reviewWindowHint(attempt.uploadClosesAt, nowMs)
	const textId = `open-comment-${view.questionId}`

	const save = async () => {
		if (form.score === null) return
		setSaving(true)
		setError(null)
		const outcome = await saveOpenReview({
			attemptId: attempt.attemptId,
			questionId: view.questionId,
			review: { score: form.score, comment: form.comment.trim() || undefined },
		})
		setSaving(false)
		if (!outcome.ok) {
			if (outcome.kind !== 'auth' && outcome.kind !== 'aborted') setError(reviewErrorText(outcome))
			return
		}
		setForm(initialReviewForm(outcome.data.review))
		onSaved()
	}

	return (
		<div className="mt-4 space-y-4">
			<div className="rounded-2xl border border-border/70 bg-secondary/55 p-4 text-sm">
				<p className="mb-2 font-medium">Ответ ученика</p>
				{open.text ? <p className="break-words whitespace-pre-wrap">{open.text}</p> : <p>Текста нет</p>}
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium">Фото ответа{open.photos.length ? ` (${open.photos.length})` : ''}</p>
				{open.photos.length === 0 ? (
					<p className="text-sm text-muted-foreground">Фото не загружены</p>
				) : (
					<ul className="flex flex-wrap gap-3">
						{open.photos.map((photo, index) => (
							<li key={photo.id} className="w-32 space-y-1">
								<a
									href={answerPhotoUrl(photo.id, 'full')}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Открыть фото ${index + 1} в полном размере`}
									className="block overflow-hidden rounded-xl border border-border/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<img
										src={answerPhotoUrl(photo.id, 'thumb')}
										alt={`Фото ответа ${index + 1}`}
										loading="lazy"
										className="aspect-square w-full object-cover"
									/>
								</a>
								<p className="text-xs text-muted-foreground">Загружено {formatDateTime(photo.uploadedAt)}</p>
							</li>
						))}
					</ul>
				)}
			</div>

			{open.referenceText ? (
				<details className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm">
					<summary className="cursor-pointer font-medium">Эталонный ответ и критерии</summary>
					<MdxRenderer source={open.referenceText} className="prose mt-3 max-w-none prose-p:my-1" />
				</details>
			) : null}

			<div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
				{open.review ? (
					<div className="text-sm">
						<p className="font-medium">Оценено: {open.review.score}</p>
						<p className="text-muted-foreground">
							{isNoAnswerReview(open.review)
								? 'Автоматически: нет ответа'
								: `${open.review.reviewerName ?? 'Проверяющий'}, ${formatDateTime(open.review.reviewedAt)}`}
						</p>
						{open.review.comment ? <p className="mt-1 break-words whitespace-pre-wrap">{open.review.comment}</p> : null}
					</div>
				) : null}

				<div className="space-y-2">
					<p id={`${textId}-score`} className="text-sm font-medium">
						Оценка
					</p>
					<ToggleGroup
						type="single"
						variant="outline"
						aria-labelledby={`${textId}-score`}
						value={form.score === null ? '' : String(form.score)}
						onValueChange={(value) => {
							if (value) setForm((current) => ({ ...current, score: Number(value) }))
						}}
						disabled={!ready || saving}
						className="justify-start"
					>
						{OPEN_REVIEW_SCORES.map((score) => (
							<ToggleGroupItem key={score} value={String(score)} className="size-10 text-base">
								{score}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				<div className="space-y-2">
					<label htmlFor={textId} className="text-sm font-medium">
						Комментарий
					</label>
					<Textarea
						id={textId}
						value={form.comment}
						maxLength={OPEN_REVIEW_COMMENT_MAX_LENGTH}
						disabled={!ready || saving}
						onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
						className="min-h-24"
					/>
				</div>

				{hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
				{!ready && !hint ? <p className="text-sm text-muted-foreground">Окно загрузки фото ещё открыто</p> : null}
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}

				<Button type="button" disabled={!canSaveReview({ form, saved, ready, saving })} onClick={save}>
					{saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
					Сохранить оценку
				</Button>
			</div>
		</div>
	)
}
