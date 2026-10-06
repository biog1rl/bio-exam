/**
 * Middleware для валидации параметров
 * Валидирует URL параметры (например, формат UUID)
 */

import type { Request, Response, NextFunction } from 'express'

import { ERROR_MESSAGES } from '../lib/constants.js'
import { ApiError } from '../lib/errors.js'
import { nameMiddleware } from '../lib/middleware-name.js'
import { isUuid } from '../lib/uuid.js'

/**
 * Валидирует, что URL параметр является корректным UUID
 *
 * @param paramName Имя параметра для валидации (по умолчанию: 'id')
 * @returns Express middleware функция
 *
 * @example
 * router.get('/:id', validateUUID('id'), handler)
 * router.get('/:userId/posts/:postId', validateUUID('userId'), validateUUID('postId'), handler)
 */
export function validateUUID(paramName = 'id') {
	return nameMiddleware((req: Request, res: Response, next: NextFunction) => {
		const value = req.params[paramName]

		if (!value) {
			// Параметр отсутствует - пусть другой middleware обработает
			return next()
		}

		// Express может вернуть массив для некоторых паттернов роутинга
		if (Array.isArray(value)) {
			throw ApiError.badRequest(`${ERROR_MESSAGES.INVALID_UUID}: ${paramName} (unexpected array)`)
		}

		if (!isUuid(value)) {
			throw ApiError.badRequest(`${ERROR_MESSAGES.INVALID_UUID}: ${paramName}`)
		}

		next()
	}, `validateUUID(${paramName})`)
}
