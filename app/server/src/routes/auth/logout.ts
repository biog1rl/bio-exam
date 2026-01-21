import { Router } from 'express'

import { clearSessionCookie } from '../../middleware/auth/session.js'

const router = Router()

router.post('/', (_req, res) => {
	clearSessionCookie(res)
	res.json({ ok: true })
})

export default router
