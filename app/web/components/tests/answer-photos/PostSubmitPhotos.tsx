'use client'

import { UploadWindowRefusalSchema } from '@bio-exam/exam-core'

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'

import { CircleAlert, Loader2 } from 'lucide-react'

import { UploadWindowLine, useUploadWindowView } from '@/components/tests/attempt-result/UploadWindowLine'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { failureMessage } from '@/lib/http/errors'
import { mdxFallbackText } from '@/lib/mdx/fallback-text'
import { completeAnswerUploads, type AnswerPhotoTarget } from '@/lib/tests/answer-photos-api'

import { PhotoBlock, type PhotoSource } from './PhotoBlock'
import { QrUploadDialog } from './QrUploadDialog'
import { missingPhotosText, postSubmitRows } from './post-submit-rows'
import type { PhotoQueueState, PhotoUploadQueue } from './upload-queue'
import { listInto, type AnswerPhotoSession, type SessionPhotoHandle } from './use-answer-photos'
import { usePointerKind } from './use-pointer-kind'

const DONE_FAILED_TEXT = 'Не удалось завершить загрузку. Повторите попытку.'

export type PostSubmitQuestionView = { id: string; number: number; promptText: string }

type Props = {
	target: Pick<AnswerPhotoTarget, 'testId' | 'sessionId'>
	photoSession: AnswerPhotoSession
	questions: readonly PostSubmitQuestionView[]
	uploadClosesAt: string | null
	serverOffsetMs: number
	sources: readonly PhotoSource[]
	onUploadsDone: (uploadClosesAt: string | null) => void
}

function isBusy(state: PhotoQueueState): boolean {
	return state.items.some(
		(item) => item.status === 'preparing' || item.status === 'uploading' || item.status === 'retrying'
	)
}

function doneCount(state: PhotoQueueState): number {
	return state.items.filter((item) => item.status === 'done').length
}

function useAnyBusy(queues: readonly PhotoUploadQueue[]): boolean {
	const store = useMemo(
		() => ({
			subscribe(listener: () => void) {
				const unsubscribers = queues.map((queue) => queue.subscribe(listener))
				return () => {
					for (const unsubscribe of unsubscribers) unsubscribe()
				}
			},
			snapshot: () => queues.some((queue) => isBusy(queue.snapshot())),
		}),
		[queues]
	)
	return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}

function QuestionRow({
	question,
	handle,
	sources,
	finePointer,
	disabled,
}: {
	question: PostSubmitQuestionView
	handle: SessionPhotoHandle
	sources: readonly PhotoSource[]
	finePointer: boolean
	disabled: boolean
}) {
	const state = useSyncExternalStore(handle.queue.subscribe, handle.queue.snapshot, handle.queue.snapshot)
	const noPhotos = doneCount(state) === 0 && !isBusy(state)
	const text = mdxFallbackText(question.promptText).trim()
	return (
		<li className="border-t border-border py-4 first:border-t-0 first:pt-0">
			<div className="mb-3 min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<p className="text-sm font-medium">Вопрос {question.number}</p>
					{noPhotos ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
							<CircleAlert aria-hidden="true" className="size-3.5" />
							Нет фото
						</span>
					) : null}
				</div>
				{text ? <p className="line-clamp-2 text-xs break-words text-muted-foreground">{text}</p> : null}
			</div>
			<PhotoBlock
				photos={handle}
				disabled={disabled}
				sources={sources}
				actions={finePointer ? <QrUploadDialog photos={handle} questionNumber={question.number} /> : undefined}
			/>
		</li>
	)
}

export function PostSubmitPhotos({
	target,
	photoSession,
	questions,
	uploadClosesAt,
	serverOffsetMs,
	sources,
	onUploadsDone,
}: Props) {
	const titleId = useId()
	const view = useUploadWindowView(uploadClosesAt, serverOffsetMs)
	const finePointer = usePointerKind() === 'fine'
	const handles = useMemo(
		() => new Map(questions.map((question) => [question.id, photoSession.photosFor(question.id)])),
		[questions, photoSession]
	)
	const queues = useMemo(() => [...handles.values()].map((handle) => handle.queue), [handles])
	const busy = useAnyBusy(queues)
	const [order, setOrder] = useState<readonly string[] | null>(null)
	const [confirming, setConfirming] = useState(false)
	const [missing, setMissing] = useState<readonly number[]>([])
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let alive = true
		const entries = [...handles.values()]
		void Promise.all(entries.map((handle) => listInto(handle))).then(() => {
			if (!alive) return
			const counts = new Map([...handles].map(([id, handle]) => [id, doneCount(handle.queue.snapshot())]))
			setOrder(postSubmitRows(questions, counts).order)
		})
		return () => {
			alive = false
		}
	}, [handles, questions])

	if (view.state === 'none' || view.state === 'closed') return null

	const finish = async () => {
		setConfirming(false)
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

	const onDone = () => {
		const counts = new Map([...handles].map(([id, handle]) => [id, doneCount(handle.queue.snapshot())]))
		const rows = postSubmitRows(questions, counts)
		if (!rows.needsConfirm) {
			void finish()
			return
		}
		setMissing(rows.missing)
		setConfirming(true)
	}

	const byId = new Map(questions.map((question) => [question.id, question]))

	return (
		<section
			aria-labelledby={titleId}
			className="max-w-3xl space-y-4 rounded-3xl border border-border bg-card p-4 tab-sm:p-5"
		>
			<div className="space-y-1">
				<h2 id={titleId} className="text-lg font-semibold">
					Добавьте фото к ответам
				</h2>
				<UploadWindowLine uploadClosesAt={uploadClosesAt} serverOffsetMs={serverOffsetMs} />
				<p className="text-sm text-muted-foreground">Тест сдан. Добавьте фото решений, пока открыто время для фото.</p>
			</div>
			{order === null ? (
				<Skeleton aria-hidden="true" className="h-24 w-full rounded-lg" />
			) : (
				<ul role="list">
					{order.map((id) => {
						const question = byId.get(id)
						const handle = handles.get(id)
						if (!question || !handle) return null
						return (
							<QuestionRow
								key={id}
								question={question}
								handle={handle}
								sources={sources}
								finePointer={finePointer}
								disabled={saving}
							/>
						)
					})}
				</ul>
			)}
			<div className="space-y-2 border-t border-border pt-4">
				<Button
					type="button"
					className="h-11 w-full tab-sm:h-9 tab-sm:w-auto"
					disabled={busy || saving || order === null}
					aria-busy={saving ? true : undefined}
					onClick={onDone}
				>
					{saving ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
					Готово, фото загружены
				</Button>
				<p className="text-xs text-muted-foreground">
					{busy
						? 'Дождитесь, пока загрузятся все фото.'
						: 'После нажатия окно загрузки закроется, и работа сразу попадёт к проверяющему.'}
				</p>
				{error ? (
					<p role="alert" className="text-sm break-words text-destructive">
						{error}
					</p>
				) : null}
			</div>
			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Отправить работу без части фото?</AlertDialogTitle>
						<AlertDialogDescription>{missingPhotosText(missing)}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Вернуться</AlertDialogCancel>
						<AlertDialogAction onClick={() => void finish()}>Отправить</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}
