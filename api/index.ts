import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async (req: VercelRequest, res: VercelResponse) => {
	try {
		// 1. Проверяем критические переменные окружения до загрузки приложения
		if (!process.env.DATABASE_URL) {
			console.error('CRITICAL: DATABASE_URL is not set in Vercel environment variables')
			return res.status(500).json({
				error: 'Configuration Error',
				message: 'DATABASE_URL is missing. Please add it to Vercel Project Settings.',
			})
		}

		// 2. Динамически импортируем приложение из корневого dist.
		// Это позволяет поймать ошибки инициализации (например, в db/index.ts)
		// @ts-ignore - compiled file
		const { default: app } = await import('../dist/app.js')

		return app(req, res)
	} catch (err) {
		console.error('Vercel Entry Point Error:', err)
		res.status(500).json({
			error: 'Function Invocation Error',
			message: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
			env_check: {
				has_db_url: !!process.env.DATABASE_URL,
				node_env: process.env.NODE_ENV,
			},
		})
	}
}
