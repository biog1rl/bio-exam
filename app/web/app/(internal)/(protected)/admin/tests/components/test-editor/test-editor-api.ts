import { apiFetch } from '@/lib/api-fetch'

import type { TestFormData } from '../../types'

async function readApiError(response: Response, fallback: string) {
	const data = (await response.json().catch(() => null)) as { error?: string } | null
	return data?.error || fallback
}

export async function assignStudentToTest(testId: string, userId: string) {
	const response = await apiFetch(`/api/tests/${testId}/assignments`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ userId }),
	})
	if (!response.ok) throw new Error(await readApiError(response, 'Ошибка назначения студента'))
}

export async function removeStudentFromTest(testId: string, userId: string) {
	const response = await apiFetch(`/api/tests/${testId}/assignments/${userId}`, { method: 'DELETE' })
	if (!response.ok) throw new Error(await readApiError(response, 'Ошибка удаления студента'))
}

export async function createTest(payload: TestFormData) {
	const response = await apiFetch('/api/tests/save', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})
	if (!response.ok) throw new Error(await readApiError(response, 'Ошибка сохранения'))
	return (await response.json().catch(() => null)) as {
		test?: { id?: string; topicSlug?: string; slug?: string }
	} | null
}

export async function reorderTestQuestions(testId: string, questionIds: string[]) {
	const response = await apiFetch(`/api/tests/${testId}/questions/reorder`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ questionIds }),
	})
	if (!response.ok) throw new Error(await readApiError(response, 'Не удалось сохранить порядок вопросов'))
}

export async function createQuestionDraft(testId: string) {
	const response = await apiFetch(`/api/tests/${testId}/question-drafts`, { method: 'POST' })
	if (!response.ok) throw new Error(await readApiError(response, 'Не удалось создать черновик вопроса'))
	return (await response.json().catch(() => null)) as unknown
}

export async function deleteQuestionDraft(testId: string, draftId: string) {
	const response = await apiFetch(`/api/tests/${testId}/question-drafts/${draftId}`, { method: 'DELETE' })
	if (!response.ok) throw new Error(await readApiError(response, 'Не удалось удалить черновик вопроса'))
}

export async function deleteTestQuestion(testId: string, questionId: string) {
	const response = await apiFetch(`/api/tests/${testId}/questions/${questionId}`, { method: 'DELETE' })
	if (!response.ok) throw new Error(await readApiError(response, 'Не удалось удалить вопрос'))
}

export async function updateTestSettings(testId: string, form: TestFormData) {
	const response = await apiFetch(`/api/tests/${testId}/settings`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			topicId: form.topicId,
			title: form.title,
			slug: form.slug,
			description: form.description,
			isPublished: form.isPublished,
			showCorrectAnswer: form.showCorrectAnswer,
			scoringRules: form.scoringRules,
			timeLimitMinutes: form.timeLimitMinutes,
			redThresholdMinutes: form.redThresholdMinutes,
			warningThresholdMinutes: form.warningThresholdMinutes,
			passingScore: form.passingScore,
			order: form.order,
		}),
	})
	if (!response.ok) throw new Error(await readApiError(response, 'Ошибка сохранения'))
	return (await response.json()) as { test?: { topicSlug?: string }; assetsMoved?: boolean }
}

export async function exportTestArchive(testId: string, slug: string, withAnswers: boolean) {
	const response = await apiFetch(`/api/tests/${testId}/export?withAnswers=${withAnswers}`)
	if (!response.ok) throw new Error('Ошибка экспорта')

	const blob = await response.blob()
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = `${slug || 'test'}.zip`
	anchor.click()
	URL.revokeObjectURL(url)
}
