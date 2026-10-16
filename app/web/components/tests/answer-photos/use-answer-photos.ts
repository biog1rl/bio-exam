'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { RequestFailure } from '@/lib/http/request'
import {
	deleteAnswerPhoto,
	listAnswerPhotos,
	uploadAnswerPhoto,
	type AnswerPhotoTarget,
} from '@/lib/tests/answer-photos-api'

import { prepareForUpload } from './resize'
import { createPhotoUploadQueue, type PhotoQueueState, type PhotoUploadQueue } from './upload-queue'

export type AnswerPhotoQueueHandle = {
	target: AnswerPhotoTarget
	queue: PhotoUploadQueue
	listed(): boolean
	markListed(): void
}

export type AnswerPhotoSession = {
	photosFor(questionId: string): AnswerPhotoQueueHandle
}

type MaxCountOf = (questionId: string) => number

type SessionRegistry = AnswerPhotoSession & { retain(): void; release(): void }

function createQueueHandle(target: AnswerPhotoTarget, maxCount: number | undefined): AnswerPhotoQueueHandle {
	let listed = false
	const queue = createPhotoUploadQueue({
		maxCount,
		upload: (photoId, blob, fileName) => uploadAnswerPhoto(target, photoId, blob, fileName),
		remove: (photoId) => deleteAnswerPhoto(target, photoId),
		prepare: prepareForUpload,
		randomId: () => crypto.randomUUID(),
	})
	return {
		target,
		queue,
		listed: () => listed,
		markListed() {
			listed = true
		},
	}
}

function createSessionRegistry(
	testId: string,
	sessionId: string | null,
	maxCountOf: MaxCountOf | undefined
): SessionRegistry {
	const handles = new Map<string, AnswerPhotoQueueHandle>()
	let pendingRelease: ReturnType<typeof setTimeout> | null = null

	function dispose(): void {
		for (const handle of handles.values()) handle.queue.dispose()
		handles.clear()
	}

	return {
		photosFor(questionId) {
			const existing = handles.get(questionId)
			if (existing) return existing
			const handle = createQueueHandle({ testId, sessionId: sessionId ?? '', questionId }, maxCountOf?.(questionId))
			handles.set(questionId, handle)
			return handle
		},
		retain() {
			if (pendingRelease !== null) clearTimeout(pendingRelease)
			pendingRelease = null
		},
		release() {
			if (pendingRelease !== null) clearTimeout(pendingRelease)
			pendingRelease = setTimeout(() => {
				pendingRelease = null
				dispose()
			}, 0)
		},
	}
}

export function useAnswerPhotoSession(ids: {
	testId: string
	sessionId: string | null
	maxCountOf?: MaxCountOf
}): AnswerPhotoSession {
	const { testId, sessionId, maxCountOf } = ids
	const registry = useMemo(() => createSessionRegistry(testId, sessionId, maxCountOf), [testId, sessionId, maxCountOf])
	useEffect(() => {
		registry.retain()
		return () => registry.release()
	}, [registry])
	return registry
}

export type AnswerPhotoListing = 'loading' | 'ready' | 'failed'

export type AnswerPhotosView = {
	state: PhotoQueueState
	listing: AnswerPhotoListing
	loadFailure: RequestFailure | null
	reload(): void
	add(files: readonly File[]): void
	retry(photoId: string): void
	remove(photoId: string): void
}

export function useAnswerPhotos(handle: AnswerPhotoQueueHandle): AnswerPhotosView {
	const { queue, target } = handle
	const state = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot)
	const [listing, setListing] = useState<AnswerPhotoListing>(() => (handle.listed() ? 'ready' : 'loading'))
	const [loadFailure, setLoadFailure] = useState<RequestFailure | null>(null)
	const mountedRef = useRef(true)

	const fetchList = useCallback(() => {
		void listAnswerPhotos(target).then((outcome) => {
			if (!mountedRef.current) return
			if (outcome.ok) {
				queue.seed(outcome.data.photos)
				handle.markListed()
				setLoadFailure(null)
				setListing('ready')
				return
			}
			setLoadFailure(outcome)
			setListing('failed')
		})
	}, [handle, queue, target])

	useEffect(() => {
		mountedRef.current = true
		if (!handle.listed()) fetchList()
		return () => {
			mountedRef.current = false
		}
	}, [handle, fetchList])

	const reload = useCallback(() => {
		setListing('loading')
		setLoadFailure(null)
		fetchList()
	}, [fetchList])

	return {
		state,
		listing,
		loadFailure,
		reload,
		add: queue.add,
		retry: queue.retry,
		remove: queue.remove,
	}
}

function primeListing(handle: AnswerPhotoQueueHandle): void {
	if (handle.listed()) return
	void listAnswerPhotos(handle.target).then((outcome) => {
		if (!outcome.ok || handle.listed()) return
		handle.queue.seed(outcome.data.photos)
		handle.markListed()
	})
}

function createCountStore(session: AnswerPhotoSession, questionIds: readonly string[]) {
	const handles = questionIds.map((questionId) => session.photosFor(questionId))
	let seen: readonly PhotoQueueState[] = []
	let value: ReadonlyMap<string, number> = new Map()
	return {
		snapshot(): ReadonlyMap<string, number> {
			const states = handles.map((handle) => handle.queue.snapshot())
			if (states.length === seen.length && states.every((state, index) => state === seen[index])) return value
			seen = states
			value = new Map(
				questionIds.map((questionId, index) => [
					questionId,
					states[index]?.items.filter((item) => item.status === 'done').length ?? 0,
				])
			)
			return value
		},
		subscribe(listener: () => void): () => void {
			const unsubscribers = handles.map((handle) => handle.queue.subscribe(listener))
			for (const handle of handles) primeListing(handle)
			return () => {
				for (const unsubscribe of unsubscribers) unsubscribe()
			}
		},
	}
}

export function useAnswerPhotoCounts(
	session: AnswerPhotoSession,
	questionIds: readonly string[]
): ReadonlyMap<string, number> {
	const store = useMemo(() => createCountStore(session, questionIds), [session, questionIds])
	return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
}
