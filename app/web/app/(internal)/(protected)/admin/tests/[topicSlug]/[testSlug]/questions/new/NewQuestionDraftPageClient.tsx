'use client'

import { useEffect, useRef } from 'react'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
	actionErrorMessage,
	createQuestionDraft as createQuestionDraftRequest,
	fetchTestBySlug,
} from '../../../../components/test-editor/test-editor-api'

interface Props {
	topicSlug: string
	testSlug: string
}

function resolveDraftId(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null
	const candidate = data as {
		draftId?: string
		id?: string
		draft?: { id?: string }
	}
	return candidate.draftId ?? candidate.id ?? candidate.draft?.id ?? null
}

export default function NewQuestionDraftPageClient({ topicSlug, testSlug }: Props) {
	const router = useRouter()
	const startedRef = useRef(false)

	useEffect(() => {
		if (startedRef.current) return
		startedRef.current = true
		let isCancelled = false

		const createQuestionDraft = async () => {
			try {
				const testData = await fetchTestBySlug(topicSlug, testSlug).catch((error: unknown) => {
					throw new Error(actionErrorMessage(error, 'Не удалось загрузить тест'))
				})
				const draftData = await createQuestionDraftRequest(testData.test.id)
				const draftId = resolveDraftId(draftData)
				if (!draftId) {
					throw new Error('API не вернул draftId черновика вопроса')
				}

				if (!isCancelled) {
					router.replace(`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${draftId}`)
				}
			} catch (error) {
				const message = actionErrorMessage(error, 'Не удалось создать черновик вопроса')
				if (!message) return
				toast.error(message)
				if (!isCancelled) {
					router.replace(`/admin/tests/${topicSlug}/${testSlug}`)
				}
			}
		}

		void createQuestionDraft()

		return () => {
			isCancelled = true
		}
	}, [router, topicSlug, testSlug])

	return (
		<div className="flex items-center justify-center rounded-4xl border border-border/80 bg-card/90 p-12 shadow-sm">
			<Loader2 className="size-8 animate-spin text-primary" />
		</div>
	)
}
