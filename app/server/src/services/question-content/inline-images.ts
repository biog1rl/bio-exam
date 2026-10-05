import { asc, eq, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, tests, topics } from '../../db/schema.js'
import { inlineImageUris, storeInlineImages } from '../assets/inline-images.js'
import { readQuestionMarkdown } from './read.js'
import { rewriteQuestionTexts } from './write.js'

export type InlineImagesReport = {
	scanned: number
	withImages: number
	inlineImages: number
	inlineBytes: number
	updated: number
	storedImages: number
	failedImages: number
	failedQuestions: Array<{ questionId: string; error: string }>
	bytesBefore: number
	bytesAfter: number
	optionsWithImages: number
	draftsWithImages: number
}

type CountRow = { count: number }

const INLINE_PATTERN = '%data:image/%'

function selectQuestions() {
	return db
		.select({
			questionId: questions.id,
			testId: questions.testId,
			testSlug: tests.slug,
			topicSlug: topics.slug,
			promptPath: questions.promptPath,
			explanationPath: questions.explanationPath,
		})
		.from(questions)
		.innerJoin(tests, eq(tests.id, questions.testId))
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.orderBy(asc(questions.createdAt), asc(questions.id))
}

async function countRows(query: SQL): Promise<number> {
	const result = await db.execute<CountRow>(query)
	return Number(result.rows[0]?.count ?? 0)
}

export async function moveInlineImages(options: { apply: boolean }): Promise<InlineImagesReport> {
	const report: InlineImagesReport = {
		scanned: 0,
		withImages: 0,
		inlineImages: 0,
		inlineBytes: 0,
		updated: 0,
		storedImages: 0,
		failedImages: 0,
		failedQuestions: [],
		bytesBefore: 0,
		bytesAfter: 0,
		optionsWithImages: await countRows(
			sql`SELECT count(*)::int AS count FROM questions WHERE options::text LIKE ${INLINE_PATTERN} OR matching_pairs::text LIKE ${INLINE_PATTERN}`
		),
		draftsWithImages: await countRows(
			sql`SELECT count(*)::int AS count FROM question_drafts WHERE payload::text LIKE ${INLINE_PATTERN}`
		),
	}
	const stored = new Set<string>()

	for (const row of await selectQuestions()) {
		report.scanned += 1
		const location = {
			topicSlug: row.topicSlug,
			testSlug: row.testSlug,
			testId: row.testId,
			questionId: row.questionId,
		}
		const promptText = await readQuestionMarkdown({ ...location, storedPath: row.promptPath, kind: 'prompt' })
		const explanationText = await readQuestionMarkdown({
			...location,
			storedPath: row.explanationPath,
			kind: 'explanation',
		})
		const uris = [...inlineImageUris(promptText), ...inlineImageUris(explanationText)]
		if (uris.length === 0) continue

		report.withImages += 1
		report.inlineImages += uris.length
		report.inlineBytes += uris.reduce((sum, uri) => sum + uri.length, 0)
		report.bytesBefore += promptText.length + explanationText.length
		if (!options.apply) continue

		try {
			const prompt = await storeInlineImages(promptText)
			const explanation = await storeInlineImages(explanationText)
			report.failedImages += prompt.failed + explanation.failed
			for (const key of [...prompt.keys, ...explanation.keys]) stored.add(key)
			report.bytesAfter += prompt.text.length + explanation.text.length
			if (prompt.text === promptText && explanation.text === explanationText) continue
			await rewriteQuestionTexts({
				questionId: row.questionId,
				expected: { promptPath: row.promptPath, explanationPath: row.explanationPath },
				promptText: prompt.text,
				explanationText: explanation.text.length > 0 ? explanation.text : null,
			})
			report.updated += 1
		} catch (error) {
			report.failedQuestions.push({
				questionId: row.questionId,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	report.storedImages = stored.size
	return report
}
