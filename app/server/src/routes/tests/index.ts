/**
 * API роуты для управления тестами
 */
import { Router } from 'express'

import { assetsRouter } from './admin/assets.js'
import { attemptsRouter } from './admin/attempts.js'
import { exportRouter } from './admin/export.js'
import { questionDraftsRouter } from './admin/question-drafts.js'
import { questionTypesRouter } from './admin/question-types.js'
import { questionsRouter } from './admin/questions.js'
import { scoringRulesRouter } from './admin/scoring-rules.js'
import { testsBySlugRouter } from './admin/tests-by-slug.js'
import { testsCoreRouter } from './admin/tests-core.js'
import { testsDeleteRouter } from './admin/tests-delete.js'
import { testsListRouter } from './admin/tests-list.js'
import { topicsRouter } from './admin/topics.js'
import { assignmentsRouter } from './assignments.js'

const router = Router()

router.use(topicsRouter)
router.use(testsListRouter)
router.use(questionTypesRouter)
router.use(scoringRulesRouter)
router.use(testsBySlugRouter)
router.use(questionDraftsRouter)
router.use(testsCoreRouter)
router.use(questionsRouter)
router.use(testsDeleteRouter)
router.use(assetsRouter)
router.use(exportRouter)

// Admin: test-side assignment endpoints
router.use('/:testId/assignments', assignmentsRouter)

router.use(attemptsRouter)

export default router
