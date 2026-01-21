/**
 * Корневой роутер API.
 */
import { Router } from 'express'

import authRouter from './auth/index.js'
import rbacRouter from './rbac/index.js'
import sidebarRouter from './sidebar/index.js'
import usersRouter from './users/index.js'

const router = Router()

router.use('/users', usersRouter)
router.use('/auth', authRouter)
router.use('/rbac', rbacRouter)
router.use('/sidebar', sidebarRouter)

export default router
