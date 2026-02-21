'use client'

import { useEffect, useRef } from 'react'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-fetch'

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
				const testRes = await apiFetch(`/api/tests/by-slug/${topicSlug}/${testSlug}`)
				if (!testRes.ok) {
					const data = (await testRes.json().catch(() => null)) as { error?: string } | null
					throw new Error(data?.error || 'Не удалось загрузить тест')
				}
				const testData = (await testRes.json().catch(() => null)) as { test?: { id?: string } } | null
				const testId = testData?.test?.id
				if (!testId) {
					throw new Error('Не удалось определить id теста')
				}

				const createRes = await apiFetch(`/api/tests/${testId}/question-drafts`, { method: 'POST' })
				if (!createRes.ok) {
					const data = (await createRes.json().catch(() => null)) as { error?: string } | null
					throw new Error(data?.error || 'Не удалось создать черновик вопроса')
				}

				const draftData = (await createRes.json().catch(() => null)) as unknown
				const draftId = resolveDraftId(draftData)
				if (!draftId) {
					throw new Error('API не вернул draftId черновика вопроса')
				}

				if (!isCancelled) {
					router.replace(`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${draftId}`)
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Не удалось создать черновик вопроса')
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
		<div className="flex items-center justify-center p-12">
			<Loader2 className="h-8 w-8 animate-spin" />
		</div>
	)
}
