/**
 * Точка входа для локальной разработки.
 * Запускает Express сервер на указанном порту.
 */
import app from './app.js'
import { pgPool } from './db/index.js'
import { DEFAULTS } from './lib/constants.js'
import logger from './lib/logger.js'

const PORT = Number(process.env.PORT ?? DEFAULTS.PORT)

const server = app.listen(PORT, () => {
	logger.info({ port: PORT }, 'bio-exam API started')
})

// Обработчик graceful shutdown
async function gracefulShutdown(signal: string) {
	logger.info({ signal }, 'Получен сигнал завершения, закрываем соединения...')

	// Прекращаем принимать новые соединения
	server.close((err) => {
		if (err) {
			logger.error({ err }, 'Ошибка закрытия HTTP сервера')
		} else {
			logger.info('HTTP сервер закрыт')
		}
	})

	// Закрываем пул соединений БД
	try {
		await pgPool.end()
		logger.info('Пул соединений БД закрыт')
	} catch (err) {
		logger.error({ err }, 'Ошибка закрытия пула БД')
	}

	// Даём время на завершение pending запросов
	setTimeout(() => {
		logger.info('Завершение работы')
		process.exit(0)
	}, 5000)
}

// Обработка сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
