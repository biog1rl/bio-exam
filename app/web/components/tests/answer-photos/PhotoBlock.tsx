'use client'

import { ANSWER_PHOTO_LIMIT_MESSAGE, ANSWER_PHOTO_MAX_COUNT } from '@bio-exam/exam-core'

import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react'

import { Camera, CircleAlert, ImageOff, ImagePlus, Images, Loader2, RotateCw, Trash2, X } from 'lucide-react'

import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestError } from '@/lib/http/request'
import { answerPhotoUrl } from '@/lib/tests/answer-photos-api'

import type { PhotoItem, PhotoItemStatus } from './upload-queue'
import { useAnswerPhotos, type AnswerPhotoQueueHandle } from './use-answer-photos'

export type PhotoSource = 'file' | 'camera' | 'gallery'

type PhotoBlockProps = {
	photos: AnswerPhotoQueueHandle
	disabled: boolean
	sources?: readonly PhotoSource[]
}

const DEFAULT_SOURCES: readonly PhotoSource[] = ['file']

const SOURCE_ORDER: readonly PhotoSource[] = ['file', 'camera', 'gallery']

const SOURCE_VIEW: Record<PhotoSource, { label: string; Icon: typeof ImagePlus }> = {
	file: { label: 'Добавить фото', Icon: ImagePlus },
	camera: { label: 'Сделать фото', Icon: Camera },
	gallery: { label: 'Выбрать из галереи', Icon: Images },
}

const OCCUPYING: ReadonlySet<PhotoItemStatus> = new Set(['done', 'preparing', 'uploading', 'retrying', 'failed'])

const HINT = `До ${ANSWER_PHOTO_MAX_COUNT} фото в форматах JPEG, PNG или WebP.`
const HINT_AT_LIMIT = 'Чтобы добавить другое фото, удалите одно из прикреплённых.'

const ROW_BUTTON = 'h-11 tab:h-8'

function isLimitRefusal(item: PhotoItem): boolean {
	return item.status === 'refused' && item.message === ANSWER_PHOTO_LIMIT_MESSAGE
}

function Thumbnail({ photoId, alt }: { photoId: string; alt: string }) {
	const [broken, setBroken] = useState(false)
	if (broken) return <ImageOff role="img" aria-label={alt} className="size-5 text-muted-foreground" />
	return (
		<img
			src={answerPhotoUrl(photoId, 'thumb')}
			alt={alt}
			decoding="async"
			className="size-full object-cover"
			onError={() => setBroken(true)}
		/>
	)
}

function Spinner() {
	return <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
}

function AlertIcon() {
	return <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
}

type RowProps = {
	item: PhotoItem
	number: number
	disabled: boolean
	onRetry: (photoId: string) => void
	onRemove: (photoId: string) => void
}

function PhotoRow({ item, number, disabled, onRetry, onRemove }: RowProps) {
	const name = `Фото ${number}`
	const busy = item.status === 'preparing' || item.status === 'uploading' || item.status === 'retrying'
	const status =
		item.status === 'retrying' ? 'Повторная попытка…' : item.status === 'done' ? null : busy ? 'Загрузка…' : null
	return (
		<li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
			<div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
				{item.status === 'done' && item.photo ? (
					<Thumbnail photoId={item.photo.id} alt={name} />
				) : busy ? (
					<Spinner />
				) : (
					<AlertIcon />
				)}
			</div>
			<div className={item.message ? 'min-w-0 flex-1 basis-40' : 'min-w-0 flex-1'}>
				<p className="text-sm font-medium" aria-hidden={item.status === 'done' ? true : undefined}>
					{name}
				</p>
				{status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
				{item.message ? (
					<p role="alert" className="text-sm break-words text-destructive">
						{item.message}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 flex-wrap gap-2">
				{item.status === 'failed' ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className={ROW_BUTTON}
						disabled={disabled}
						aria-label={`Повторить загрузку фото ${number}`}
						onClick={() => onRetry(item.photoId)}
					>
						<RotateCw aria-hidden="true" className="size-4" />
						Повторить
					</Button>
				) : null}
				{item.status === 'done' || item.status === 'failed' ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={ROW_BUTTON}
						disabled={disabled}
						aria-label={`Удалить фото ${number}`}
						onClick={() => onRemove(item.photoId)}
					>
						<Trash2 aria-hidden="true" className="size-4" />
						Удалить
					</Button>
				) : null}
				{item.status === 'refused' ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={ROW_BUTTON}
						disabled={disabled}
						aria-label={`Убрать фото ${number}`}
						onClick={() => onRemove(item.photoId)}
					>
						<X aria-hidden="true" className="size-4" />
						Убрать
					</Button>
				) : null}
			</div>
		</li>
	)
}

function SourceInput({
	source,
	inputRef,
	onFiles,
}: {
	source: PhotoSource
	inputRef: RefObject<HTMLInputElement | null>
	onFiles: (files: readonly File[]) => void
}) {
	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		event.target.value = ''
		if (files.length > 0) onFiles(files)
	}
	if (source === 'camera') {
		return (
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				capture="environment"
				className="hidden"
				tabIndex={-1}
				aria-hidden="true"
				data-photo-source={source}
				onChange={onChange}
			/>
		)
	}
	return (
		<input
			ref={inputRef}
			type="file"
			accept="image/*"
			multiple
			className="hidden"
			tabIndex={-1}
			aria-hidden="true"
			data-photo-source={source}
			onChange={onChange}
		/>
	)
}

export function PhotoBlock({ photos, disabled, sources = DEFAULT_SOURCES }: PhotoBlockProps) {
	const { state, listing, loadFailure, reload, add, retry, remove } = useAnswerPhotos(photos)
	const titleId = useId()
	const hintId = useId()
	const titleRef = useRef<HTMLParagraphElement>(null)
	const listRef = useRef<HTMLUListElement>(null)
	const sourcesRef = useRef<HTMLDivElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const cameraRef = useRef<HTMLInputElement>(null)
	const galleryRef = useRef<HTMLInputElement>(null)
	const focusAfterRemoval = useRef<{ ids: readonly string[]; index: number } | null>(null)
	const inputRefs: Record<PhotoSource, RefObject<HTMLInputElement | null>> = {
		file: fileRef,
		camera: cameraRef,
		gallery: galleryRef,
	}

	const shownSources = SOURCE_ORDER.filter((source) => sources.includes(source))
	const rows = state.items.filter((item) => !isLimitRefusal(item))
	const limitRefusals = state.items.filter(isLimitRefusal)
	const atLimit = state.items.filter((item) => OCCUPYING.has(item.status)).length >= ANSWER_PHOTO_MAX_COUNT
	const ready = listing === 'ready'
	const sourceDisabled = disabled || !ready

	useEffect(() => {
		const pending = focusAfterRemoval.current
		if (!pending) return
		const present = new Set(state.items.map((item) => item.photoId))
		if (pending.ids.some((id) => present.has(id))) return
		focusAfterRemoval.current = null
		const rowsInList = Array.from(listRef.current?.querySelectorAll<HTMLLIElement>(':scope > li') ?? [])
		const buttonOf = (index: number) => rowsInList[index]?.querySelector<HTMLButtonElement>('button:not(:disabled)')
		const target =
			buttonOf(pending.index) ??
			buttonOf(pending.index - 1) ??
			sourcesRef.current?.querySelector<HTMLButtonElement>('button')
		target?.focus()
	}, [state.items])

	const startRemoval = (ids: readonly string[], index: number) => {
		focusAfterRemoval.current = { ids, index }
		for (const id of ids) remove(id)
	}

	const pick = (source: PhotoSource) => {
		if (sourceDisabled || atLimit) return
		inputRefs[source].current?.click()
	}

	return (
		<div
			role="group"
			aria-labelledby={titleId}
			className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-4"
		>
			<div className="space-y-1">
				<div className="flex items-baseline justify-between gap-2">
					<p id={titleId} ref={titleRef} tabIndex={-1} className="text-sm font-medium outline-none">
						Фото к ответу
					</p>
					<span aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground tabular-nums">
						{ready ? state.count : '—'} из {ANSWER_PHOTO_MAX_COUNT}
					</span>
				</div>
				<p id={hintId} className="text-xs text-muted-foreground">
					{atLimit ? HINT_AT_LIMIT : HINT}
				</p>
			</div>
			<div ref={sourcesRef} className="flex flex-wrap gap-2">
				{shownSources.map((source) => {
					const { label, Icon } = SOURCE_VIEW[source]
					return (
						<Button
							key={source}
							type="button"
							variant="outline"
							className="h-11 w-full aria-disabled:pointer-events-none aria-disabled:opacity-50 mob:w-auto tab:h-8"
							disabled={sourceDisabled}
							aria-disabled={atLimit ? true : undefined}
							aria-describedby={hintId}
							onClick={() => pick(source)}
						>
							<Icon aria-hidden="true" className="size-4" />
							{label}
						</Button>
					)
				})}
				{shownSources.map((source) => (
					<SourceInput key={source} source={source} inputRef={inputRefs[source]} onFiles={add} />
				))}
			</div>
			{listing === 'failed' && loadFailure ? (
				<LoadErrorAlert
					title="Не удалось загрузить фото"
					error={new RequestError(loadFailure)}
					onRetry={reload}
					focusTarget={titleRef}
				/>
			) : null}
			{listing === 'loading' ? <Skeleton aria-hidden="true" className="h-16 w-full rounded-md" /> : null}
			{rows.length > 0 || limitRefusals.length > 0 ? (
				<ul ref={listRef} role="list" className="divide-y divide-border">
					{rows.map((item, index) => (
						<PhotoRow
							key={item.photoId}
							item={item}
							number={index + 1}
							disabled={disabled}
							onRetry={retry}
							onRemove={(photoId) => startRemoval([photoId], index)}
						/>
					))}
					{limitRefusals.length > 0 ? (
						<li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
							<div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
								<AlertIcon />
							</div>
							<div className="min-w-0 flex-1 basis-40">
								<p role="alert" className="text-sm break-words text-destructive">
									{ANSWER_PHOTO_LIMIT_MESSAGE}
								</p>
								{limitRefusals.length >= 2 ? (
									<p className="text-sm text-muted-foreground">Не добавлено фото: {limitRefusals.length}</p>
								) : null}
							</div>
							<div className="flex shrink-0 flex-wrap gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={ROW_BUTTON}
									disabled={disabled}
									aria-label="Убрать сообщение о лишних фото"
									onClick={() =>
										startRemoval(
											limitRefusals.map((item) => item.photoId),
											rows.length
										)
									}
								>
									<X aria-hidden="true" className="size-4" />
									Убрать
								</Button>
							</div>
						</li>
					) : null}
				</ul>
			) : null}
		</div>
	)
}
