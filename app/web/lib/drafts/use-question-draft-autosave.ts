'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { toast } from 'sonner'

import { useUnsavedChanges } from '@/store/unsavedChanges.store'

import { DRAFT_TOAST, DRAFT_TOAST_ID } from './draft-ui'
import { questionDraftAutosaveApi } from './question-draft-api'
import {
	createQuestionDraftAutosave,
	type QuestionDraftAutosave,
	type QuestionDraftAutosaveSnapshot,
	type QuestionDraftNotice,
} from './question-draft-autosave'
import type { QuestionDraftCopyStorage } from './question-draft-copy'

const DETACHED_STORAGE: QuestionDraftCopyStorage = {
	getItem: () => null,
	setItem: () => undefined,
	removeItem: () => undefined,
}

function browserStorage(): QuestionDraftCopyStorage {
	try {
		return window.localStorage ?? DETACHED_STORAGE
	} catch {
		return DETACHED_STORAGE
	}
}

function showNotice(notice: QuestionDraftNotice): void {
	if (notice === 'conflict-resolved') toast.warning(DRAFT_TOAST.conflictResolved)
	else if (notice === 'conflict-repeated') toast.error(DRAFT_TOAST.conflictRepeated)
	else if (notice === 'forbidden') toast.error(DRAFT_TOAST.forbidden, { id: DRAFT_TOAST_ID.forbidden })
	else if (notice === 'gone') toast.error(DRAFT_TOAST.gone, { id: DRAFT_TOAST_ID.gone })
	else if (notice === 'restored') toast.info(DRAFT_TOAST.restored, { id: DRAFT_TOAST_ID.restored })
}

function noSubscription(): () => void {
	return () => undefined
}

function noSnapshot(): null {
	return null
}

type Created = { key: string; autosave: QuestionDraftAutosave }

export function useQuestionDraftAutosave(input: {
	testId: string | undefined
	draftId: string | undefined
	userId: string | undefined
	serverDraft: { payload: unknown; lockVersion: number } | undefined
	pathname: string
	onRestoreCopy: (payload: unknown) => void
}): { autosave: QuestionDraftAutosave | null; snapshot: QuestionDraftAutosaveSnapshot | null } {
	const { testId, draftId, userId, serverDraft, pathname, onRestoreCopy } = input
	const key = testId && draftId && userId ? `${testId}:${draftId}:${userId}` : null
	const [created, setCreated] = useState<Created | null>(null)
	const onRestoreCopyRef = useRef(onRestoreCopy)
	const registerFlush = useUnsavedChanges((s) => s.registerFlush)
	const setDirty = useUnsavedChanges((s) => s.setDirty)
	const clearUnsaved = useUnsavedChanges((s) => s.clear)

	useEffect(() => {
		onRestoreCopyRef.current = onRestoreCopy
	}, [onRestoreCopy])

	useEffect(() => {
		if (!key || !testId || !draftId || !userId || !serverDraft) return
		if (created?.key === key) return
		setCreated({
			key,
			autosave: createQuestionDraftAutosave({
				draftId,
				userId,
				serverPayload: serverDraft.payload,
				serverLockVersion: serverDraft.lockVersion,
				api: questionDraftAutosaveApi(testId, draftId),
				storage: browserStorage(),
				win: window,
				onNotice: showNotice,
			}),
		})
	}, [key, testId, draftId, userId, serverDraft, created])

	const autosave = created !== null && created.key === key ? created.autosave : null

	useEffect(() => {
		if (!autosave) return
		autosave.start()
		return () => autosave.dispose()
	}, [autosave])

	const subscribe = useCallback(
		(listener: () => void) => (autosave ? autosave.subscribe(listener) : noSubscription()),
		[autosave]
	)
	const getSnapshot = useCallback(() => (autosave ? autosave.getSnapshot() : null), [autosave])
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, noSnapshot)

	useEffect(() => {
		if (!autosave) return
		registerFlush(pathname, () => autosave.flushForLeave())
		return () => {
			registerFlush(pathname, null)
			clearUnsaved(pathname)
		}
	}, [autosave, pathname, registerFlush, clearUnsaved])

	const hasUnsavedWrite = snapshot?.hasUnsavedWrite ?? false
	useEffect(() => {
		if (!autosave) return
		setDirty(pathname, hasUnsavedWrite)
	}, [autosave, pathname, hasUnsavedWrite, setDirty])

	const canRestoreCopy = snapshot?.canRestoreCopy ?? false
	useEffect(() => {
		if (!autosave || !canRestoreCopy) return
		toast.info(DRAFT_TOAST.diverged, {
			id: DRAFT_TOAST_ID.diverged,
			duration: Infinity,
			action: {
				label: DRAFT_TOAST.restoreCopyAction,
				onClick: () => {
					const payload = autosave.restoreDivergedCopy()
					if (payload !== null) onRestoreCopyRef.current(payload)
				},
			},
		})
		return () => {
			toast.dismiss(DRAFT_TOAST_ID.diverged)
		}
	}, [autosave, canRestoreCopy])

	return { autosave, snapshot }
}
