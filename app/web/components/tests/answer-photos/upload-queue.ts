import {
	UploadWindowRefusalSchema,
	answerPhotoLimitMessage,
	type AnswerPhoto,
	type AnswerPhotoDeleteResponse,
	type AnswerPhotoUploadResponse,
} from '@bio-exam/exam-core'

import type { SaveQueueClock } from '@/lib/drafts/save-queue'
import { failureMessage, readApiError } from '@/lib/http/errors'
import type { RequestFailure, RequestOutcome } from '@/lib/http/request'
import { uploadWindowRefusalText, type UploadWindowAction } from '@/lib/tests/upload-window'

export type PhotoItemStatus = 'preparing' | 'uploading' | 'retrying' | 'done' | 'failed' | 'refused'

export type PhotoItem = {
	photoId: string
	status: PhotoItemStatus
	message: string | null
	photo: AnswerPhoto | null
	limitRefusal: boolean
}

export type PhotoQueueState = { items: readonly PhotoItem[]; count: number; atLimit: boolean; max: number }

export type PreparedPhoto = { blob: Blob; fileName: string }

export type PhotoUploadQueueOptions = {
	upload: (photoId: string, blob: Blob, fileName: string) => Promise<RequestOutcome<AnswerPhotoUploadResponse>>
	remove: (photoId: string) => Promise<RequestOutcome<AnswerPhotoDeleteResponse>>
	prepare: (file: File) => Promise<PreparedPhoto>
	randomId: () => string
	maxCount: number
	clock?: SaveQueueClock
	now?: () => number
}

export type PhotoUploadQueue = {
	add(files: readonly File[]): void
	retry(photoId: string): void
	remove(photoId: string): void
	seed(photos: readonly AnswerPhoto[], since?: number): void
	sync(photos: readonly AnswerPhoto[], since?: number): void
	mark(): number
	snapshot(): PhotoQueueState
	subscribe(listener: () => void): () => void
	dispose(): void
}

export const PHOTO_RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 9000]

const OCCUPYING: ReadonlySet<PhotoItemStatus> = new Set(['done', 'preparing', 'uploading', 'retrying', 'failed'])

const REMOVABLE: ReadonlySet<PhotoItemStatus> = new Set(['done', 'retrying', 'failed'])

const NETWORK_FAILURE: RequestFailure = { ok: false, kind: 'network', message: '' }

type Entry = {
	photoId: string
	status: PhotoItemStatus
	message: string | null
	photo: AnswerPhoto | null
	file: File | null
	prepared: PreparedPhoto | null
	queued: boolean
	attempts: number
	timer: unknown
	removing: boolean
	limitRefusal: boolean
	settledMark: number
}

function isRetryable(failure: RequestFailure): boolean {
	if (failure.kind === 'network') return true
	if (failure.kind !== 'http') return false
	const status = failure.status ?? 0
	return status >= 500 || status === 429
}

function isRefusal(failure: RequestFailure): boolean {
	return failure.kind === 'http' && !isRetryable(failure)
}

export function createPhotoUploadQueue(options: PhotoUploadQueueOptions): PhotoUploadQueue {
	const { upload, remove, prepare, randomId, maxCount } = options
	const now = options.now ?? options.clock?.now ?? (() => Date.now())
	const setTimer = options.clock?.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
	const clearTimer =
		options.clock?.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

	const entries: Entry[] = []
	const listeners = new Set<() => void>()
	let count = 0
	let active: Entry | null = null
	let disposed = false
	let state: PhotoQueueState | null = null
	let currentMark = 0
	const removedMarks = new Map<string, number>()

	function tick(): number {
		currentMark += 1
		return currentMark
	}

	function notify(): void {
		state = null
		for (const listener of [...listeners]) listener()
	}

	function entryOf(photoId: string): Entry | undefined {
		return entries.find((entry) => entry.photoId === photoId)
	}

	function createEntry(photoId: string, status: PhotoItemStatus): Entry {
		return {
			photoId,
			status,
			message: null,
			photo: null,
			file: null,
			prepared: null,
			queued: false,
			attempts: 0,
			timer: null,
			removing: false,
			limitRefusal: false,
			settledMark: 0,
		}
	}

	function doneCount(): number {
		return entries.filter((entry) => entry.status === 'done').length
	}

	function forget(entry: Entry): void {
		drop(entry)
		removedMarks.set(entry.photoId, tick())
	}

	function sync(photos: readonly AnswerPhoto[], since: number = currentMark): void {
		if (disposed) return
		const onServer = new Set(photos.map((photo) => photo.id))
		const stale = entries.filter(
			(entry) =>
				entry.status === 'done' && !entry.removing && !onServer.has(entry.photoId) && entry.settledMark <= since
		)
		for (const entry of stale) forget(entry)
		const added = photos
			.filter((photo) => !entryOf(photo.id) && (removedMarks.get(photo.id) ?? 0) <= since)
			.map((photo) => {
				const entry = createEntry(photo.id, 'done')
				entry.photo = photo
				entry.settledMark = tick()
				return entry
			})
		const firstPending = entries.findIndex((entry) => entry.status !== 'done')
		entries.splice(firstPending < 0 ? entries.length : firstPending, 0, ...added)
		const nextCount = doneCount()
		if (stale.length === 0 && added.length === 0 && nextCount === count) return
		count = nextCount
		notify()
	}

	function drop(entry: Entry): void {
		const index = entries.indexOf(entry)
		if (index >= 0) entries.splice(index, 1)
	}

	function cancelTimer(entry: Entry): void {
		if (entry.timer !== null) clearTimer(entry.timer)
		entry.timer = null
	}

	function messageFor(failure: RequestFailure, action: UploadWindowAction): string | null {
		if (failure.kind === 'http' && failure.status === 422) {
			const refusal = UploadWindowRefusalSchema.safeParse(failure.body)
			if (refusal.success) return uploadWindowRefusalText(refusal.data, now(), action)
		}
		if (failure.kind === 'http' && failure.status === 503) {
			const server = readApiError(failure.body)
			if (server) return server
		}
		return failureMessage(failure) || null
	}

	function isCurrent(entry: Entry): boolean {
		return !disposed && active === entry
	}

	async function safePrepare(file: File): Promise<PreparedPhoto> {
		try {
			return await prepare(file)
		} catch {
			return { blob: file, fileName: file.name }
		}
	}

	async function safeUpload(entry: Entry, prepared: PreparedPhoto): Promise<RequestOutcome<AnswerPhotoUploadResponse>> {
		try {
			return await upload(entry.photoId, prepared.blob, prepared.fileName)
		} catch {
			return NETWORK_FAILURE
		}
	}

	async function safeRemove(photoId: string): Promise<RequestOutcome<AnswerPhotoDeleteResponse>> {
		try {
			return await remove(photoId)
		} catch {
			return NETWORK_FAILURE
		}
	}

	function finish(): void {
		active = null
		notify()
		pump()
	}

	function settleUpload(entry: Entry, outcome: RequestOutcome<AnswerPhotoUploadResponse>): void {
		if (outcome.ok) {
			entry.status = 'done'
			entry.message = null
			entry.photo = outcome.data.photo
			entry.prepared = null
			entry.attempts = 0
			entry.settledMark = tick()
			count = outcome.data.count
			finish()
			return
		}
		if (isRetryable(outcome) && entry.attempts < PHOTO_RETRY_DELAYS_MS.length) {
			const delay = PHOTO_RETRY_DELAYS_MS[entry.attempts] ?? 0
			entry.attempts += 1
			entry.status = 'retrying'
			entry.timer = setTimer(() => {
				entry.timer = null
				if (isCurrent(entry)) void send(entry)
			}, delay)
			notify()
			return
		}
		entry.message = messageFor(outcome, 'upload')
		if (isRefusal(outcome)) {
			entry.status = 'refused'
			entry.prepared = null
		} else {
			entry.status = 'failed'
		}
		finish()
	}

	async function send(entry: Entry): Promise<void> {
		const prepared = entry.prepared
		if (!prepared) {
			finish()
			return
		}
		entry.status = 'uploading'
		notify()
		const outcome = await safeUpload(entry, prepared)
		if (!isCurrent(entry)) return
		settleUpload(entry, outcome)
	}

	async function start(entry: Entry): Promise<void> {
		if (!entry.prepared && entry.file) {
			const prepared = await safePrepare(entry.file)
			if (!isCurrent(entry)) return
			entry.prepared = prepared
			entry.file = null
		}
		await send(entry)
	}

	function pump(): void {
		if (disposed || active) return
		const next = entries.find((entry) => entry.queued)
		if (!next) return
		next.queued = false
		active = next
		void start(next)
	}

	function settleRemove(entry: Entry, outcome: RequestOutcome<AnswerPhotoDeleteResponse>): void {
		if (disposed || !entries.includes(entry)) return
		entry.removing = false
		if (outcome.ok) {
			forget(entry)
			count = outcome.data.count
		} else if (outcome.kind === 'http' && outcome.status === 404) {
			forget(entry)
			count = doneCount()
		} else {
			entry.message = messageFor(outcome, 'remove')
			if (entry.status === 'retrying') entry.status = 'failed'
		}
		notify()
	}

	function occupied(): number {
		return entries.filter((entry) => OCCUPYING.has(entry.status)).length
	}

	return {
		add(files) {
			if (disposed || files.length === 0) return
			let taken = occupied()
			for (const file of files) {
				if (taken >= maxCount) {
					const refused = createEntry(randomId(), 'refused')
					refused.message = answerPhotoLimitMessage(maxCount)
					refused.limitRefusal = true
					entries.push(refused)
					continue
				}
				const entry = createEntry(randomId(), 'preparing')
				entry.file = file
				entry.queued = true
				entries.push(entry)
				taken += 1
			}
			notify()
			pump()
		},
		retry(photoId) {
			const entry = entryOf(photoId)
			if (disposed || !entry || entry.status !== 'failed' || entry.removing) return
			entry.status = 'retrying'
			entry.message = null
			entry.attempts = 0
			entry.queued = true
			notify()
			pump()
		},
		remove(photoId) {
			const entry = entryOf(photoId)
			if (disposed || !entry || entry.removing) return
			if (entry.status === 'refused') {
				drop(entry)
				notify()
				return
			}
			if (!REMOVABLE.has(entry.status)) return
			cancelTimer(entry)
			entry.queued = false
			entry.removing = true
			entry.message = null
			if (active === entry) active = null
			notify()
			pump()
			void safeRemove(photoId).then((outcome) => settleRemove(entry, outcome))
		},
		seed: sync,
		sync,
		mark() {
			return currentMark
		},
		snapshot() {
			if (!state) {
				state = {
					items: entries.map(({ photoId, status, message, photo, limitRefusal }) => ({
						photoId,
						status,
						message,
						photo,
						limitRefusal,
					})),
					count,
					atLimit: occupied() >= maxCount,
					max: maxCount,
				}
			}
			return state
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		dispose() {
			if (disposed) return
			disposed = true
			for (const entry of entries) cancelTimer(entry)
			active = null
			listeners.clear()
		},
	}
}
