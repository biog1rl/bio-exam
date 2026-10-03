/**
 * Единственный источник защиты тестовой базы данных (D-02, D-29).
 *
 * Переключатель изоляции: BIO_EXAM_ISOLATED_ENV=1. В изолированном режиме серверный код
 * не читает .env и DATABASE_URL, а берёт адрес базы только из TEST_DATABASE_URL и
 * проверяет его здесь: хост localhost или 127.0.0.1, имя базы ^test_[a-z0-9_]+$, без строки
 * запроса и фрагмента (иначе ?host= или ?hostaddr= подменили бы проверенный хост).
 *
 * Файл намеренно без импортов и только со стираемым синтаксисом TypeScript: корневые
 * .mjs-скрипты импортируют его напрямую через нативное удаление типов в Node 24.
 * Сообщения об ошибках называют только хост и имя базы, никогда весь URL, пользователя
 * или пароль.
 */

/** Имя переменной окружения, включающей изолированный режим */
export const ISOLATED_ENV_FLAG = 'BIO_EXAM_ISOLATED_ENV'

const ALLOWED_HOSTS = ['localhost', '127.0.0.1']
const TEST_DATABASE_NAME = /^test_[a-z0-9_]+$/

/** Включён ли изолированный режим (BIO_EXAM_ISOLATED_ENV=1) */
export function isIsolatedEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[ISOLATED_ENV_FLAG] === '1'
}

/**
 * Проверяет, что URL указывает на одноразовую локальную тестовую базу.
 * Возвращает исходную строку или бросает Error до любого подключения.
 */
export function assertTestDatabaseUrl(raw: string | undefined): string {
	if (raw === undefined || raw.trim() === '') {
		throw new Error('TEST_DATABASE_URL is not set')
	}

	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		throw new Error('TEST_DATABASE_URL is not a valid URL')
	}

	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
		throw new Error(`TEST_DATABASE_URL protocol ${parsed.protocol} is not postgres: or postgresql:`)
	}

	// Параметры запроса меняют цель подключения в обход проверки ниже: node-postgres и libpq
	// читают ?host=, ?hostaddr=, ?sslmode= и другие. Поэтому строка запроса и фрагмент запрещены целиком.
	// Сообщение фиксированное: значения параметров могут содержать хост или учётные данные
	if (parsed.search !== '' || parsed.hash !== '') {
		throw new Error('TEST_DATABASE_URL must not contain a query string or fragment')
	}

	if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
		throw new Error(`TEST_DATABASE_URL host ${parsed.hostname} is not localhost or 127.0.0.1`)
	}

	let name: string
	try {
		name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
	} catch {
		throw new Error('TEST_DATABASE_URL database name is not valid percent-encoding')
	}
	if (!TEST_DATABASE_NAME.test(name)) {
		throw new Error(`TEST_DATABASE_URL database ${name} does not match ^test_[a-z0-9_]+$`)
	}

	return raw
}

/**
 * Адрес базы для изолированного режима: только TEST_DATABASE_URL, DATABASE_URL игнорируется.
 * Пустое, отсутствующее или некорректное значение отклоняется без запасного варианта.
 */
export function resolveIsolatedDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	return assertTestDatabaseUrl(env.TEST_DATABASE_URL)
}

/** Тот же URL с другим именем базы; результат снова проходит проверку */
export function withDatabaseName(url: string, name: string): string {
	const parsed = new URL(assertTestDatabaseUrl(url))
	parsed.pathname = `/${name}`
	return assertTestDatabaseUrl(parsed.toString())
}
