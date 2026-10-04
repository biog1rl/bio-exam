import crypto from 'node:crypto'

export type QuestionMarkdownFileName = 'prompt.md' | 'explanation.md'

export type QuestionMarkdownCandidatesParams = {
	storedPath: string | null
	topicSlug: string
	testSlug: string
	testId: string
	questionId: string
	fileName: QuestionMarkdownFileName
}

export type ContentKind = 'prompt' | 'explanation'

export type ContentKeyParams = {
	topicSlug: string
	testSlug: string
	questionId: string
	kind: ContentKind
	rev: string
}

export function topicPrefix(topicSlug: string): string {
	return `topics/${topicSlug}`
}

export function testPrefix(topicSlug: string, testSlug: string): string {
	return `${topicPrefix(topicSlug)}/${testSlug}`
}

export function questionPrefix(topicSlug: string, testSlug: string, questionId: string): string {
	return `${testPrefix(topicSlug, testSlug)}/questions/${questionId}`
}

export function questionMarkdownCandidates(params: QuestionMarkdownCandidatesParams): string[] {
	const { storedPath, topicSlug, testSlug, testId, questionId, fileName } = params

	const candidates = [
		storedPath,
		`${questionPrefix(topicSlug, testSlug, questionId)}/${fileName}`,
		`${questionPrefix(topicSlug, testSlug, testId)}/${fileName}`,
		`${questionPrefix(topicSlug, testId, questionId)}/${fileName}`,
		`${questionPrefix(topicSlug, testId, testId)}/${fileName}`,
	].filter((value): value is string => typeof value === 'string' && value.length > 0)

	return [...new Set(candidates)]
}

export function newRevision(): string {
	return crypto.randomBytes(6).toString('hex')
}

export function contentKey(params: ContentKeyParams): string {
	const { topicSlug, testSlug, questionId, kind, rev } = params
	return `${questionPrefix(topicSlug, testSlug, questionId)}/${kind}-${rev}.md`
}
