import type { VercelRequest, VercelResponse } from '@vercel/node'

// @ts-ignore - compiled file
import app from '../app/server/dist/app.js'

export default async (req: VercelRequest, res: VercelResponse) => {
	// Vercel автоматически обрабатывает Express приложения, если они экспортированы,
	// но мы оборачиваем в try-catch для лучшей диагностики
	try {
		return app(req, res)
	} catch (err) {
		console.error('Vercel Entry Point Error:', err)
		res.status(500).json({
			error: 'Function Invocation Error',
			message: err instanceof Error ? err.message : String(err),
		})
	}
}
