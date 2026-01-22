/**
 * Точка входа для Vercel Serverless Functions.
 * Экспортирует Express приложение как serverless функцию.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

import app from '../dist/app.js'

export default async (req: VercelRequest, res: VercelResponse) => {
	return app(req, res)
}
