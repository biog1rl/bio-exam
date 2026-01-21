import { Router } from 'express'

import invitesRouter from './invites.js'
import loginRouter from './login.js'
import logoutRouter from './logout.js'
import meRouter from './me.js'

const router = Router()

// Здесь пути относительны /api/auth
router.use('/login', loginRouter) // POST /login
router.use('/logout', logoutRouter) // POST /logout
router.use('/invites', invitesRouter)
router.use('/me', meRouter) // GET /me

export default router
