/**
 * Точка входа для локальной разработки.
 * Запускает Express сервер на указанном порту.
 */
import pino from 'pino'

import app from './app.js'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const PORT = Number(process.env.PORT ?? 4000)

app.listen(PORT, () => {
	logger.info({ port: PORT }, 'bio-exam API started')
})
