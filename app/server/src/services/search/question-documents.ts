import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { stripMarkdownToText } from './markdown.js'

type TextOption = {
	text?: unknown
}

type MatchingPairs = {
	left?: TextOption[]
	right?: TextOption[]
}

export type SqlExecutor = Pick<typeof db, 'execute'>

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

export async function upsertQuestionSearchDocument(
	input: QuestionSearchInput,
	executor: SqlExecutor = db
): Promise<void> {
	const doc = buildQuestionSearchDocument(input)
	await executor.execute(sql`
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
		values (
			${doc.questionId},
			${doc.testId},
			${doc.topicId},
			${doc.promptText},
			${doc.optionsText},
			${doc.matchingText},
			${doc.searchText},
			now()
		)
		on conflict (question_id) do update set
			test_id = excluded.test_id,
			topic_id = excluded.topic_id,
			prompt_text = excluded.prompt_text,
			options_text = excluded.options_text,
			matching_text = excluded.matching_text,
			search_text = excluded.search_text,
			updated_at = now()
	`)
}

export async function updateQuestionSearchDocumentLocation(
	params: {
		questionId: string
		testId: string
		topicId: string
	},
	executor: SqlExecutor = db
): Promise<void> {
	await executor.execute(sql`
		update question_search_documents
		set test_id = ${params.testId},
			topic_id = ${params.topicId},
			updated_at = now()
		where question_id = ${params.questionId}
	`)
}
