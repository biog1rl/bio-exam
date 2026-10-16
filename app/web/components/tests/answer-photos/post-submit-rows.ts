import { pluralRu } from '@bio-exam/exam-core'

export type PostSubmitQuestion = { id: string; number: number }

export type PostSubmitRows = {
	order: readonly string[]
	missing: readonly number[]
	needsConfirm: boolean
}

export function postSubmitRows(
	questions: readonly PostSubmitQuestion[],
	counts: ReadonlyMap<string, number>
): PostSubmitRows {
	const byNumber = [...questions].sort((left, right) => left.number - right.number)
	const empty = byNumber.filter((question) => (counts.get(question.id) ?? 0) === 0)
	const filled = byNumber.filter((question) => (counts.get(question.id) ?? 0) > 0)
	return {
		order: [...empty, ...filled].map((question) => question.id),
		missing: empty.map((question) => question.number),
		needsConfirm: empty.length > 0,
	}
}

function joinNumbers(numbers: readonly number[]): string {
	if (numbers.length <= 1) return numbers.join('')
	return `${numbers.slice(0, -1).join(', ')} и ${numbers.at(-1)}`
}

export function missingPhotosText(numbers: readonly number[]): string {
	const word = pluralRu(numbers.length, ['вопроса', 'вопросов', 'вопросов'])
	return `Нет фото у ${numbers.length} ${word}: ${joinNumbers(numbers)}. Вопрос без текста и без фото получит 0 баллов. После отправки добавить фото будет нельзя.`
}
