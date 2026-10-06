/**
 * Корневой роутер API.
 */
import { Router } from 'express'

import authRouter from './auth/index.js'
import docsAssetsRouter from './docs/assets.js'
import groupsRouter from './groups/index.js'
import notificationsRouter from './notifications.js'
import rbacRouter from './rbac/index.js'
import searchRouter from './search.js'
import settingsRouter from './settings.js'
import sidebarRouter from './sidebar/index.js'
import testsRouter from './tests/index.js'
import publicTestsRouter from './tests/public.js'
import usersRouter from './users/index.js'

const router = Router()

router.use('/users', usersRouter)
router.use('/auth', authRouter)
router.use('/rbac', rbacRouter)
router.use('/search', searchRouter)
router.use('/notifications', notificationsRouter)
router.use('/sidebar', sidebarRouter)
router.use('/tests', testsRouter)
router.use('/tests/public', publicTestsRouter)
router.use('/settings', settingsRouter)
router.use('/groups', groupsRouter)
router.use('/docs/assets', docsAssetsRouter)

export default router
