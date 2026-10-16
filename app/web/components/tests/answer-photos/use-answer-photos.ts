'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import useSWR from 'swr'

import type { RequestFailure, RequestOutcome } from '@/lib/http/request'
import type { AnswerPhotoTarget } from '@/lib/tests/answer-photos-api'

import { prepareForUpload } from './resize'
import { linkPhotoTransport, sessionPhotoTransport, type PhotoTransport } from './transport'
import { createPhotoUploadQueue, type PhotoQueueState, type PhotoUploadQueue } from './upload-queue'

export type AnswerPhotoQueueHandle = {
	transport: PhotoTransport
	queue: PhotoUploadQueue
	listed(): boolean
	markListed(): void
}

export type SessionPhotoHandle = AnswerPhotoQueueHandle & { target: AnswerPhotoTarget }

export type AnswerPhotoSession = {
	photosFor(questionId: string): SessionPhotoHandle
}

type MaxCountOf = (questionId: string) => number

type SessionRegistry = AnswerPhotoSession & { retain(): void; release(): void }

export function createPhotoHandle(transport: PhotoTransport, maxCount: number): AnswerPhotoQueueHandle {
	let listed = false
	const queue = createPhotoUploadQueue({
		maxCount,
		upload: transport.upload,
		remove: transport.remove,
		prepare: prepareForUpload,
		randomId: () => crypto.randomUUID(),
	})
	return {
		transport,
		queue,
		listed: () => listed,
		markListed() {
			listed = true
		},
	}
}

export function createLinkPhotoHandle(token: string, maxCount: number): AnswerPhotoQueueHandle {
	return createPhotoHandle(linkPhotoTransport(token), maxCount)
}

async function listInto(handle: AnswerPhotoQueueHandle): Promise<RequestOutcome<unknown>> {
	const since = handle.queue.mark()
	const outcome = await handle.transport.list()
	if (outcome.ok) {
		handle.queue.sync(outcome.data.photos, since)
		handle.markListed()
	}
	return outcome
}

function createSessionRegistry(testId: string, sessionId: string | null, maxCountOf: MaxCountOf): SessionRegistry {
	const handles = new Map<string, SessionPhotoHandle>()
	let pendingRelease: ReturnType<typeof setTimeout> | null = null

	function dispose(): void {
		for (const handle of handles.values()) handle.queue.dispose()
		handles.clear()
	}

	return {
		photosFor(questionId) {
			const existing = handles.get(questionId)
			if (existing) return existing
			const target = { testId, sessionId: sessionId ?? '', questionId }
			const handle = { ...createPhotoHandle(sessionPhotoTransport(target), maxCountOf(questionId)), target }
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
	maxCountOf: MaxCountOf
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
	const { queue } = handle
	const state = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot)
	const [listing, setListing] = useState<AnswerPhotoListing>(() => (handle.listed() ? 'ready' : 'loading'))
	const [loadFailure, setLoadFailure] = useState<RequestFailure | null>(null)
	const mountedRef = useRef(true)

	const fetchList = useCallback(() => {
		void listInto(handle).then((outcome) => {
			if (!mountedRef.current) return
			if (outcome.ok) {
				setLoadFailure(null)
				setListing('ready')
				return
			}
			setLoadFailure(outcome)
			setListing('failed')
		})
	}, [handle])

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
	void listInto(handle)
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

export type PhotoListSync = { failures: number; lastFailure: RequestFailure | null }

const LIST_NETWORK_FAILURE: RequestFailure = { ok: false, kind: 'network', message: '' }

async function pollList(handle: AnswerPhotoQueueHandle): Promise<RequestOutcome<unknown>> {
	try {
		return await listInto(handle)
	} catch {
		return LIST_NETWORK_FAILURE
	}
}

export function usePhotoListSync(
	handle: AnswerPhotoQueueHandle,
	{ intervalMs, enabled }: { intervalMs: number; enabled: boolean }
): PhotoListSync {
	const [sync, setSync] = useState<PhotoListSync>({ failures: 0, lastFailure: null })
	useSWR(enabled ? handle.transport.key : null, () => pollList(handle), {
		refreshInterval: intervalMs,
		refreshWhenHidden: false,
		revalidateOnReconnect: true,
		shouldRetryOnError: false,
		onSuccess: (outcome) =>
			setSync((current) => {
				if (outcome.ok) return current.failures === 0 ? current : { failures: 0, lastFailure: null }
				return { failures: current.failures + 1, lastFailure: outcome }
			}),
	})
	return sync
}
