import { Router } from 'express'

import invitesRouter from './invites.js'
import loginRouter from './login.js'
import logoutRouter from './logout.js'
import meRouter from './me.js'
import refreshRouter from './refresh.js'

const router = Router()

// Здесь пути относительны /api/auth
router.use('/login', loginRouter) // POST /login
router.use('/logout', logoutRouter) // POST /logout
router.use('/invites', invitesRouter)
router.use('/me', meRouter) // GET /me
router.use('/refresh', refreshRouter)

export default router
