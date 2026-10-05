import { eq, isNull } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../../db/index.js'
import { testScoringSettings, tests } from '../../../db/schema.js'
import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { TestScoringRulesSchema, resolveEffectiveScoringRules } from '../../../lib/tests/scoring.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canManageCatalog, canReadTest, canWriteTest } from '../../../services/access-policy/index.js'
import { ensureGlobalScoringRules, syncQuestionPointsForTestByTypeConfig } from './shared.js'

const router = Router()

const GlobalScoringRulesPayloadSchema = z.object({
	rules: TestScoringRulesSchema,
})

const TestScoringRulesPayloadSchema = z
	.object({
		rules: TestScoringRulesSchema.optional(),
		useGlobal: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.useGlobal === true) return
		if (!value.rules) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['rules'],
				message: 'rules обязательны, если useGlobal не установлен',
			})
		}
	})

router.get('/scoring-rules/global', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const rules = await ensureGlobalScoringRules(req.authUser?.id)
		res.json({ rules })
	} catch (e) {
		next(e)
	}
})

router.put('/scoring-rules/global', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const parsed = GlobalScoringRulesPayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id ?? null
		const now = new Date()

		await db
			.insert(testScoringSettings)
			.values({
				id: 'global',
				rules: parsed.data.rules,
				updatedBy: userId,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: testScoringSettings.id,
				set: {
					rules: parsed.data.rules,
					updatedAt: now,
					updatedBy: userId,
				},
			})

		const testsUsingGlobal = await db.select({ id: tests.id }).from(tests).where(isNull(tests.scoringRules))
		for (const testRow of testsUsingGlobal) {
			await syncQuestionPointsForTestByTypeConfig(testRow.id)
		}

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.get('/scoring-rules/tests/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canReadTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
		const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
		if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

		const globalRules = await ensureGlobalScoringRules(req.authUser?.id)
		const effectiveRules = resolveEffectiveScoringRules({
			globalRules,
			testOverrideRules: test.scoringRules,
		})

		res.json({
			testId,
			hasOverride: test.scoringRules != null,
			overrideRules: test.scoringRules,
			globalRules,
			effectiveRules,
		})
	} catch (e) {
		next(e)
	}
})

router.put('/scoring-rules/tests/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		if (!(await canWriteTest(req, testId))) return res.status(403).json({ error: 'Forbidden' })
		const parsed = TestScoringRulesPayloadSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
		if (!test) return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })

		const globalRules = await ensureGlobalScoringRules(req.authUser?.id)
		const useGlobal = parsed.data.useGlobal === true
		let overrideRules: z.infer<typeof TestScoringRulesSchema> | null = null
		let effectiveRules = globalRules
		if (!useGlobal) {
			overrideRules = TestScoringRulesSchema.parse(parsed.data.rules)
			effectiveRules = overrideRules
		}

		await db
			.update(tests)
			.set({
				scoringRules: overrideRules,
				updatedAt: new Date(),
				updatedBy: req.authUser?.id ?? null,
			})
			.where(eq(tests.id, testId))

		await syncQuestionPointsForTestByTypeConfig(testId)

		res.json({
			ok: true,
			hasOverride: !useGlobal,
			overrideRules,
			effectiveRules,
		})
	} catch (e) {
		next(e)
	}
})

export { router as scoringRulesRouter }
