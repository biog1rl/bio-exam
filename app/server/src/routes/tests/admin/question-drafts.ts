import { and, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../../db/index.js'
import { questionDrafts, tests } from '../../../db/schema.js'
import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { UpdateQuestionDraftSchema } from '../../../schemas/tests.js'
import { canWriteTest } from '../../../services/access-policy/index.js'

const router = Router()

type QuestionDraftRow = typeof questionDrafts.$inferSelect
type QuestionDraftPayload = Record<string, unknown>

const QUESTION_DRAFT_NOT_FOUND_ERROR = 'Question draft not found'
const QUESTION_DRAFT_LOCK_CONFLICT_ERROR = 'Question draft lock version mismatch'

const DEFAULT_QUESTION_DRAFT_PAYLOAD: QuestionDraftPayload = {
	question: {},
}

const questionDraftSelect = {
	id: questionDrafts.id,
	testId: questionDrafts.testId,
	payload: questionDrafts.payload,
	lockVersion: questionDrafts.lockVersion,
	createdAt: questionDrafts.createdAt,
	updatedAt: questionDrafts.updatedAt,
}

function normalizeQuestionDraftPayload(payload: unknown): QuestionDraftPayload {
	if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
		return payload as QuestionDraftPayload
	}
	return {}
}

function toQuestionDraftResponse(
	draft: Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
) {
	return {
		id: draft.id,
		testId: draft.testId,
		payload: normalizeQuestionDraftPayload(draft.payload),
		lockVersion: draft.lockVersion,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt,
	}
}

function toQuestionDraftListItem(
	draft: Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
) {
	const payload = normalizeQuestionDraftPayload(draft.payload)
	return {
		id: draft.id,
		testId: draft.testId,
		payload,
		lockVersion: draft.lockVersion,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt,
	}
}

router.post('/:testId/question-drafts', validateUUID('testId'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canWriteTest(req, req.params.testId as string))) return res.status(403).json({ error: 'Forbidden' })
		const ownerId = req.authUser?.id
		if (!ownerId) {
			return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
		}

		const testId = req.params.testId as string
		const [existingTest] = await db.select({ id: tests.id }).from(tests).where(eq(tests.id, testId)).limit(1)
		if (!existingTest) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		const [created] = await db
			.insert(questionDrafts)
			.values({
				testId,
				ownerId,
				payload: { ...DEFAULT_QUESTION_DRAFT_PAYLOAD },
			})
			.returning(questionDraftSelect)

		res.status(201).json({ draft: toQuestionDraftResponse(created) })
	} catch (e) {
		next(e)
	}
})

router.get('/:testId/question-drafts', validateUUID('testId'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canWriteTest(req, req.params.testId as string))) return res.status(403).json({ error: 'Forbidden' })
		const ownerId = req.authUser?.id
		if (!ownerId) {
			return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
		}

		const testId = req.params.testId as string
		const rows = await db
			.select(questionDraftSelect)
			.from(questionDrafts)
			.where(and(eq(questionDrafts.ownerId, ownerId), eq(questionDrafts.testId, testId)))
			.orderBy(desc(questionDrafts.updatedAt))

		res.json({
			drafts: rows.map((draft) => toQuestionDraftListItem(draft)),
		})
	} catch (e) {
		next(e)
	}
})

router.get(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			if (!(await canWriteTest(req, req.params.testId as string))) return res.status(403).json({ error: 'Forbidden' })
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const [draft] = await db
				.select(questionDraftSelect)
				.from(questionDrafts)
				.where(
					and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
				)
				.limit(1)

			if (!draft) {
				return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
			}

			res.json({ draft: toQuestionDraftResponse(draft) })
		} catch (e) {
			next(e)
		}
	}
)

router.patch(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			if (!(await canWriteTest(req, req.params.testId as string))) return res.status(403).json({ error: 'Forbidden' })
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const parsed = UpdateQuestionDraftSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const updateSet = {
				payload: parsed.data.payload,
				lockVersion: sql`${questionDrafts.lockVersion} + 1`,
				updatedAt: new Date(),
			}

			let updated:
				| Pick<QuestionDraftRow, 'id' | 'testId' | 'payload' | 'lockVersion' | 'createdAt' | 'updatedAt'>
				| undefined
			if (typeof parsed.data.lockVersion === 'number') {
				;[updated] = await db
					.update(questionDrafts)
					.set(updateSet)
					.where(
						and(
							eq(questionDrafts.id, draftId),
							eq(questionDrafts.testId, testId),
							eq(questionDrafts.ownerId, ownerId),
							eq(questionDrafts.lockVersion, parsed.data.lockVersion)
						)
					)
					.returning(questionDraftSelect)

				if (!updated) {
					const [existing] = await db
						.select({ id: questionDrafts.id })
						.from(questionDrafts)
						.where(
							and(
								eq(questionDrafts.id, draftId),
								eq(questionDrafts.testId, testId),
								eq(questionDrafts.ownerId, ownerId)
							)
						)
						.limit(1)
					if (!existing) {
						return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
					}
					return res.status(409).json({ error: QUESTION_DRAFT_LOCK_CONFLICT_ERROR })
				}
			} else {
				;[updated] = await db
					.update(questionDrafts)
					.set(updateSet)
					.where(
						and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
					)
					.returning(questionDraftSelect)

				if (!updated) {
					return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
				}
			}

			res.json({ draft: toQuestionDraftResponse(updated) })
		} catch (e) {
			next(e)
		}
	}
)

router.delete(
	'/:testId/question-drafts/:draftId',
	validateUUID('testId'),
	validateUUID('draftId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			if (!(await canWriteTest(req, req.params.testId as string))) return res.status(403).json({ error: 'Forbidden' })
			const ownerId = req.authUser?.id
			if (!ownerId) {
				return res.status(401).json({ error: ERROR_MESSAGES.UNAUTHORIZED })
			}

			const testId = req.params.testId as string
			const draftId = req.params.draftId as string
			const [removed] = await db
				.delete(questionDrafts)
				.where(
					and(eq(questionDrafts.id, draftId), eq(questionDrafts.testId, testId), eq(questionDrafts.ownerId, ownerId))
				)
				.returning({ id: questionDrafts.id })

			if (!removed) {
				return res.status(404).json({ error: QUESTION_DRAFT_NOT_FOUND_ERROR })
			}

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

export { router as questionDraftsRouter }
