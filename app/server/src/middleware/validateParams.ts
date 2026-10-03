/**
 * Middleware для валидации параметров
 * Валидирует URL параметры (например, формат UUID)
 */

import type { Request, Response, NextFunction } from 'express'

import { ERROR_MESSAGES } from '../lib/constants.js'
import { ApiError } from '../lib/errors.js'

/**
 * Регулярное выражение для UUID v4
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Валидирует, что URL параметр является корректным UUID v4
 *
 * @param paramName Имя параметра для валидации (по умолчанию: 'id')
 * @returns Express middleware функция
 *
 * @example
 * router.get('/:id', validateUUID('id'), handler)
 * router.get('/:userId/posts/:postId', validateUUID('userId'), validateUUID('postId'), handler)
 */
export function validateUUID(paramName = 'id') {
	return (req: Request, res: Response, next: NextFunction) => {
		const value = req.params[paramName]

		if (!value) {
			// Параметр отсутствует - пусть другой middleware обработает
			return next()
		}

		// Express может вернуть массив для некоторых паттернов роутинга
		if (Array.isArray(value)) {
			throw ApiError.badRequest(`${ERROR_MESSAGES.INVALID_UUID}: ${paramName} (unexpected array)`)
		}

		if (!UUID_REGEX.test(value)) {
			throw ApiError.badRequest(`${ERROR_MESSAGES.INVALID_UUID}: ${paramName}`)
		}

		next()
	}
}

/**
 * Проверяет, является ли строка валидным UUID v4
 *
 * @param value Строка для проверки
 * @returns true если валидный UUID v4
 */
export function isValidUUID(value: string): boolean {
	return UUID_REGEX.test(value)
}
