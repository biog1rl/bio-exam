/**
 * Константы приложения
 * Централизованное хранение магических строк, значений по умолчанию и конфигурации
 */

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
	USER_NOT_FOUND: 'User not found',
	TEST_NOT_FOUND: 'Test not found',
	TOPIC_NOT_FOUND: 'Topic not found',

	// Conflicts
	TOPIC_SLUG_EXISTS: 'Topic with this slug already exists',
	TOPIC_SLUG_RESERVED: 'Этот адрес темы занят разделом сайта, выберите другой',
	TEST_SLUG_EXISTS: 'Test with this slug already exists in this topic',

	// RBAC
	ADMIN_GRANTS_IMMUTABLE: 'Admin role grants are immutable',
	ADMIN_USER_GRANTS_IMMUTABLE: 'Admin user grants are immutable',
	UNKNOWN_ROLE: 'Unknown role',
	UNKNOWN_DOMAIN_ACTION: 'Unknown domain/action',
} as const

export const BCRYPT_COST = 12

export const DEFAULTS = {
	SESSION_MAX_AGE_DAYS: 30,
	JWT_SECRET: 'dev-secret-change-me',
	PORT: 4000,
} as const
