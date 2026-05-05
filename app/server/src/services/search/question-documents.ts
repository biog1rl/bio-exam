import { pgPool } from '../../db/index.js'
import { stripMarkdownToText } from './markdown.js'

type TextOption = {
	text?: unknown
}

type MatchingPairs = {
	left?: TextOption[]
	right?: TextOption[]
}

export type QuestionSearchInput = {
	questionId: string
	testId: string
	topicId: string
	type: string
	promptText: string
	options?: unknown
	matchingPairs?: unknown
}

function normalizeSpace(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

function textFromOptions(value: unknown): string {
	if (!Array.isArray(value)) return ''
	return normalizeSpace(
		value
			.map((item) => (item && typeof item === 'object' ? String((item as TextOption).text ?? '') : ''))
			.filter(Boolean)
			.join(' ')
	)
}

function textFromMatchingPairs(value: unknown): string {
	if (!value || typeof value !== 'object') return ''
	const pairs = value as MatchingPairs
	return normalizeSpace([textFromOptions(pairs.left), textFromOptions(pairs.right)].filter(Boolean).join(' '))
}

export function buildQuestionSearchDocument(input: QuestionSearchInput) {
	const promptText = normalizeSpace(stripMarkdownToText(input.promptText))
	const optionsText = textFromOptions(input.options)
	const matchingText = textFromMatchingPairs(input.matchingPairs)
	const searchText = normalizeSpace([promptText, optionsText, matchingText, input.type].filter(Boolean).join(' '))

	return {
		questionId: input.questionId,
		testId: input.testId,
		topicId: input.topicId,
		promptText,
		optionsText,
		matchingText,
		searchText,
	}
}

export async function upsertQuestionSearchDocument(input: QuestionSearchInput): Promise<void> {
	const doc = buildQuestionSearchDocument(input)
	await pgPool.query(
		`
			insert into question_search_documents (
				question_id,
				test_id,
				topic_id,
				prompt_text,
				options_text,
				matching_text,
				search_text,
				updated_at
			)
			values ($1, $2, $3, $4, $5, $6, $7, now())
			on conflict (question_id) do update set
				test_id = excluded.test_id,
				topic_id = excluded.topic_id,
				prompt_text = excluded.prompt_text,
				options_text = excluded.options_text,
				matching_text = excluded.matching_text,
				search_text = excluded.search_text,
				updated_at = now()
		`,
		[doc.questionId, doc.testId, doc.topicId, doc.promptText, doc.optionsText, doc.matchingText, doc.searchText]
	)
}

export async function updateQuestionSearchDocumentLocation(params: {
	questionId: string
	testId: string
	topicId: string
}): Promise<void> {
	await pgPool.query(
		`
			update question_search_documents
			set test_id = $2,
				topic_id = $3,
				updated_at = now()
			where question_id = $1
		`,
		[params.questionId, params.testId, params.topicId]
	)
}
