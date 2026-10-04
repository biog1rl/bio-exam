'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { saveAttemptDraft, startTestSession, submitPublicTestAnswers } from '@/lib/tests/api'
import type { PublicTestDetail, PublicTestQuestion } from '@/lib/tests/types'

import type { ClientAttemptStorage } from '../client-attempt-id'
import {
	createAttemptLifecycle,
	type AttemptLifecycle,
	type AttemptNotice,
	type AttemptSnapshot,
	type AttemptVisibility,
	type AttemptVisibilityEvent,
} from './lifecycle'

function memoryAttemptStorage(): ClientAttemptStorage {
	const data = new Map<string, string>()
	return {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value)
		},
		removeItem: (key) => {
			data.delete(key)
		},
	}
}

export function browserAttemptStorage(): ClientAttemptStorage {
	if (typeof window === 'undefined') return memoryAttemptStorage()
	try {
		const storage = window.localStorage
		storage.getItem('')
		return storage
	} catch {
		return memoryAttemptStorage()
	}
}

export function browserVisibility(): AttemptVisibility {
	return {
		isHidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
		subscribe(listener: (event: AttemptVisibilityEvent) => void) {
			if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
			const onVisibilityChange = () => listener(document.visibilityState === 'hidden' ? 'hidden' : 'visible')
			const onPageHide = () => listener('pagehide')
			const onOnline = () => listener('online')
			document.addEventListener('visibilitychange', onVisibilityChange)
			window.addEventListener('pagehide', onPageHide)
			window.addEventListener('online', onOnline)
			return () => {
				document.removeEventListener('visibilitychange', onVisibilityChange)
				window.removeEventListener('pagehide', onPageHide)
				window.removeEventListener('online', onOnline)
			}
		},
	}
}

type UseAttemptLifecycleInput = {
	test: PublicTestDetail
	questions: readonly PublicTestQuestion[]
	userId: string
	onNotice: (notice: AttemptNotice) => void
}

type NoticeChannel = {
	emit(notice: AttemptNotice): void
	setHandler(handler: (notice: AttemptNotice) => void): void
}

function createNoticeChannel(): NoticeChannel {
	let current: ((notice: AttemptNotice) => void) | null = null
	return {
		emit(notice) {
			current?.(notice)
		},
		setHandler(handler) {
			current = handler
		},
	}
}

function orderedQuestionIds(questions: readonly PublicTestQuestion[]): string[] {
	return [...questions].sort((a, b) => a.order - b.order).map((question) => question.id)
}

function createBrowserAttemptLifecycle(input: UseAttemptLifecycleInput, channel: NoticeChannel): AttemptLifecycle {
	return createAttemptLifecycle({
		testId: input.test.id,
		userId: input.userId,
		questionIds: orderedQuestionIds(input.questions),
		timeLimitMinutes: input.test.timeLimitMinutes ?? null,
		storage: browserAttemptStorage(),
		visibility: browserVisibility(),
		api: { start: startTestSession, saveDraft: saveAttemptDraft, submit: submitPublicTestAnswers },
		onNotice: channel.emit,
	})
}

export function useAttemptLifecycle(input: UseAttemptLifecycleInput): {
	lifecycle: AttemptLifecycle
	snapshot: AttemptSnapshot
} {
	const [channel] = useState(createNoticeChannel)
	const [lifecycle] = useState(() => createBrowserAttemptLifecycle(input, channel))
	const { onNotice, questions } = input
	const questionIds = useMemo(() => orderedQuestionIds(questions), [questions])
	useEffect(() => {
		channel.setHandler(onNotice)
	}, [channel, onNotice])
	useEffect(() => {
		lifecycle.setQuestionIds(questionIds)
	}, [lifecycle, questionIds])
	useEffect(() => {
		lifecycle.init()
		return () => lifecycle.dispose()
	}, [lifecycle])
	const snapshot = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot, lifecycle.getSnapshot)
	return { lifecycle, snapshot }
}
