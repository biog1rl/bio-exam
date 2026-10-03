/**
 * Централизованная обработка ошибок API
 * Предоставляет типизированные классы ошибок с консистентными HTTP статус-кодами
 */

export class ApiError extends Error {
	public readonly statusCode: number
	public readonly isOperational: boolean

	constructor(statusCode: number, message: string, isOperational = true) {
		super(message)
		this.statusCode = statusCode
		this.isOperational = isOperational
		this.name = 'ApiError'

		// Сохраняем правильный stack trace (доступно только в V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ApiError)
		}
	}

	static badRequest(message = 'Bad request'): ApiError {
		return new ApiError(400, message)
	}

	static unauthorized(message = 'Unauthorized'): ApiError {
		return new ApiError(401, message)
	}

	static forbidden(message = 'Forbidden'): ApiError {
		return new ApiError(403, message)
	}

	static notFound(message = 'Not found'): ApiError {
		return new ApiError(404, message)
	}

	static conflict(message = 'Conflict'): ApiError {
		return new ApiError(409, message)
	}

	static tooManyRequests(message = 'Too many requests'): ApiError {
		return new ApiError(429, message)
	}

	static internal(message = 'Internal server error'): ApiError {
		return new ApiError(500, message, false)
	}
}

/**
 * Type guard для проверки, является ли ошибка ApiError
 */
export function isApiError(error: unknown): error is ApiError {
	return error instanceof ApiError
}
