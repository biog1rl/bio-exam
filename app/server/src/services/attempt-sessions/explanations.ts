import { readQuestionMarkdown } from '../question-content/index.js'
import type { ExplanationReader } from '../scored-attempt/index.js'

export function explanationReaderFor(test: { id: string; slug: string; topicSlug: string }): ExplanationReader {
	return (q) =>
		q.explanationPath
			? readQuestionMarkdown({
					storedPath: q.explanationPath,
					topicSlug: test.topicSlug,
					testSlug: test.slug,
					testId: test.id,
					questionId: q.id,
					kind: 'explanation',
				}).then((text) => text || null)
			: Promise.resolve(null)
}
