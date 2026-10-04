/**
 * Константы приложения
 * Централизованное хранение магических строк, значений по умолчанию и конфигурации
 */

export const HTTP_STATUS = {
	OK: 200,
	CREATED: 201,
	NO_CONTENT: 204,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
} as const

export const ERROR_MESSAGES = {
	// Auth
	INVALID_CREDENTIALS: 'Invalid credentials',
	MISSING_CREDENTIALS: 'Missing credentials',
	ACCOUNT_NOT_ACTIVATED: 'Account is not activated',
	UNAUTHORIZED: 'Unauthorized',
	TOO_MANY_REQUESTS: 'Too many requests. Please try again later.',

	// Validation
	BAD_REQUEST: 'Bad request',
	INVALID_UUID: 'Invalid UUID format',

	// Resources
	NOT_FOUND: 'Not found',
	USER_NOT_FOUND: 'User not found',
	TEST_NOT_FOUND: 'Test not found',
	TOPIC_NOT_FOUND: 'Topic not found',

	// Conflicts
	SLUG_EXISTS: 'Resource with this slug already exists',
	TOPIC_SLUG_EXISTS: 'Topic with this slug already exists',
	TEST_SLUG_EXISTS: 'Test with this slug already exists in this topic',

	// RBAC
	ADMIN_GRANTS_IMMUTABLE: 'Admin role grants are immutable',
	ADMIN_USER_GRANTS_IMMUTABLE: 'Admin user grants are immutable',
	UNKNOWN_ROLE: 'Unknown role',
	UNKNOWN_DOMAIN_ACTION: 'Unknown domain/action',

	// Storage
	STORAGE_NOT_CONFIGURED: 'Storage not configured',
	STORAGE_ERROR: 'Storage operation failed',
} as const

export const BCRYPT_COST = 12

export const DEFAULTS = {
	SESSION_MAX_AGE_DAYS: 30,
	JWT_SECRET: 'dev-secret-change-me',
	LOG_LEVEL: 'info',
	PORT: 4000,
} as const
