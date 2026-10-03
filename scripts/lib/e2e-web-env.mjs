/**
 * Закрытое окружение Next для e2e и его защита (D-17, D-29, T-1-28).
 *
 * next build и next start вызывают @next/env loadEnvConfig: он дописывает в process.env каждый
 * ключ из app/web/.env*, которого там нет (undefined), и никогда не перезаписывает заданный.
 * Поэтому окружение Next задаётся явно и целиком (buildWebEnv), а защита проверяет, что в нём
 * правильные значения и что каждый ключ из app/web/.env* уже задан, то есть @next/env нечего
 * подставить из файлов разработчика (живой DATABASE_URL, его API_ORIGIN, секреты).
 *
 * Защита читает из .env-файлов только ИМЕНА ключей и никогда не печатает значения: каждая строка
 * нарушения имеет вид "KEY: причина", причина называет не больше хоста или имени базы.
 *
 * CLI: node scripts/lib/e2e-web-env.mjs --check
 *   проверяет process.env против app/web, печатает "next-env-guard: OK" (код 0) или
 *   "next-env-guard: FAILED" и нарушения в stderr (код 1).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertTestDatabaseUrl } from '../../app/server/src/config/test-database-url.ts'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_WEB_DIR = path.join(REPO_ROOT, 'app', 'web')

/** Маркер тестового секрета: e2e никогда не подписывает токены боевым секретом */
export const E2E_SECRET_MARKER = 'e2e-only-'

const LOOPBACK = '127.0.0.1'

// Строка присваивания в .env: NAME=..., export NAME=... (и NAME: ... как в разборе dotenv)
const ENV_LINE = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=|:\s)/

function requireVar(env, key) {
	const value = env[key]
	if (value === undefined || value === '') throw new Error(`buildWebEnv: ${key} is not set`)
	return value
}

/** Адрес Express в e2e */
function apiOrigin(port) {
	return `http://${LOOPBACK}:${port}`
}

/**
 * Единственное определение окружения Next в e2e (build и start), выводится из окружения раннера.
 * Бросает, называя отсутствующую переменную-источник.
 */
export function buildWebEnv(env) {
	const testDatabaseUrl = requireVar(env, 'TEST_DATABASE_URL')
	const secret = requireVar(env, 'AUTH_JWT_SECRET')
	const cookieName = requireVar(env, 'SESSION_COOKIE_NAME')
	const apiPort = requireVar(env, 'E2E_API_PORT')
	const webPort = requireVar(env, 'E2E_WEB_PORT')
	const webOrigin = `http://${LOOPBACK}:${webPort}`
	return {
		NODE_ENV: 'production',
		API_ORIGIN: apiOrigin(apiPort),
		APP_ORIGIN: webOrigin,
		NEXT_PUBLIC_APP_ORIGIN: webOrigin,
		// lib/env/server.ts требует это имя до Phase 4: здесь только временная база test_e2e_*
		DATABASE_URL: testDatabaseUrl,
		AUTH_JWT_SECRET: secret,
		SESSION_COOKIE_NAME: cookieName,
		// Ключ есть в .env разработчика, поэтому задан явно. Значение '1', а не пустое: при пустом
		// next build и next start пытаются «чинить» lockfile и вызывают yarn config get registry
		NEXT_IGNORE_INCORRECT_LOCKFILE: '1',
	}
}

/** .env-файлы каталога, которые может прочитать @next/env (без *.example) */
function envFiles(webDir) {
	let entries
	try {
		entries = fs.readdirSync(webDir, { withFileTypes: true })
	} catch {
		return []
	}
	return entries
		.filter((entry) => entry.isFile() && entry.name.startsWith('.env') && !entry.name.endsWith('.example'))
		.map((entry) => entry.name)
		.sort()
}

/** Ключ -> имя первого файла, где он определён (только имена, значения не сохраняются) */
function keySources(webDir) {
	const sources = new Map()
	for (const file of envFiles(webDir)) {
		const text = fs.readFileSync(path.join(webDir, file), 'utf8')
		for (const line of text.split(/\r?\n/)) {
			const match = ENV_LINE.exec(line)
			if (match && !sources.has(match[1])) sources.set(match[1], file)
		}
	}
	return sources
}

/** Имена ключей, определённых в .env* каталога webDir (кроме *.example); значения не возвращаются */
export function webEnvFileKeys(webDir) {
	return [...keySources(webDir).keys()]
}

/**
 * Причина отказа защиты базы без самих значений: даже хост живого пулера или имя базы
 * разработчика не попадают в вывод, только класс нарушения.
 */
function guardReason(value) {
	try {
		assertTestDatabaseUrl(value)
		return null
	} catch (error) {
		const message = String(error.message)
		if (message.includes(' host ')) return 'host is not localhost or 127.0.0.1'
		if (message.includes(' database ')) return 'database name does not match ^test_[a-z0-9_]+$'
		if (message.includes(' protocol ')) return 'protocol is not postgres: or postgresql:'
		return message.replace(/^TEST_DATABASE_URL\s*/, '')
	}
}

/**
 * Проверяет, что env — закрытое окружение Next для e2e. Бросает одну ошибку со строками
 * "KEY: причина"; error.violations — те же строки массивом.
 */
export function assertWebEnvClosed(env, { webDir = DEFAULT_WEB_DIR } = {}) {
	const violations = []

	if (env.NODE_ENV !== 'production') violations.push('NODE_ENV: must be production for next build and next start')

	const apiPort = env.E2E_API_PORT
	if (!apiPort) violations.push('E2E_API_PORT: is not set')
	else if (env.API_ORIGIN !== apiOrigin(apiPort)) {
		violations.push(`API_ORIGIN: does not equal the e2e Express origin on ${LOOPBACK} port ${apiPort}`)
	}

	if (env.TEST_DATABASE_URL === undefined || env.TEST_DATABASE_URL === '') {
		violations.push('TEST_DATABASE_URL: is not set')
	}
	if (env.DATABASE_URL === undefined) violations.push('DATABASE_URL: is not set')
	else {
		if (env.DATABASE_URL !== env.TEST_DATABASE_URL) violations.push('DATABASE_URL: does not equal TEST_DATABASE_URL')
		const reason = guardReason(env.DATABASE_URL)
		if (reason) violations.push(`DATABASE_URL: rejected by the test database guard (${reason})`)
	}

	if (typeof env.AUTH_JWT_SECRET !== 'string' || !env.AUTH_JWT_SECRET.startsWith(E2E_SECRET_MARKER)) {
		violations.push(`AUTH_JWT_SECRET: does not carry the ${E2E_SECRET_MARKER} test marker`)
	}

	for (const key of Object.keys(env).sort()) {
		if (key.startsWith('SUPABASE_') && env[key] !== undefined) violations.push(`${key}: must not be set in e2e`)
	}

	// Пустое значение считается заданным: @next/env заполняет только undefined
	for (const [key, file] of keySources(webDir)) {
		if (env[key] === undefined) {
			violations.push(`${key}: defined in ${file} but not set, @next/env would fill it from the file`)
		}
	}

	if (violations.length > 0) {
		const error = new Error(violations.join('\n'))
		error.violations = violations
		throw error
	}
}

function runCli() {
	try {
		assertWebEnvClosed(process.env, { webDir: DEFAULT_WEB_DIR })
		console.log('next-env-guard: OK')
		return 0
	} catch (error) {
		console.error('next-env-guard: FAILED')
		console.error(error.violations ? error.violations.join('\n') : String(error.message))
		return 1
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.includes('--check')) process.exit(runCli())
	console.error('usage: node scripts/lib/e2e-web-env.mjs --check')
	process.exit(2)
}
