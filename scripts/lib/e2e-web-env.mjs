/**
 * Закрытое окружение Next для e2e и его защита (D-17, D-29, T-1-28, D-18 фазы 4).
 *
 * next build и next start вызывают @next/env loadEnvConfig: он дописывает в process.env каждый
 * ключ из app/web/.env*, которого там нет (undefined), и никогда не перезаписывает заданный.
 * Поэтому окружение Next задаётся явно и целиком (buildWebEnv): каждый ключ из app/web/.env*
 * задан, а DATABASE_URL и AUTH_JWT_SECRET — пустые строки. Web не читает ни адрес базы, ни секрет
 * JWT (ADR-0001), а пустые строки перекрывают и файлы разработчика, и окружение раннера.
 * Защита проверяет, что значения правильные и что @next/env нечего подставить из файлов.
 *
 * Защита читает из .env-файлов только ИМЕНА ключей и никогда не печатает значения: каждая строка
 * нарушения имеет вид "KEY: причина".
 *
 * CLI: node scripts/lib/e2e-web-env.mjs --check
 *   проверяет process.env против app/web, печатает "next-env-guard: OK" (код 0) или
 *   "next-env-guard: FAILED" и нарушения в stderr (код 1).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_WEB_DIR = path.join(REPO_ROOT, 'app', 'web')

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
export function buildWebEnv(env, { webDir = DEFAULT_WEB_DIR } = {}) {
	const cookieName = requireVar(env, 'SESSION_COOKIE_NAME')
	const apiPort = requireVar(env, 'E2E_API_PORT')
	requireVar(env, 'E2E_WEB_PORT')
	const webEnv = {
		NODE_ENV: 'production',
		API_ORIGIN: apiOrigin(apiPort),
		SESSION_COOKIE_NAME: cookieName,
		// Ключ есть в .env разработчика, поэтому задан явно. Значение '1', а не пустое: при пустом
		// next build и next start пытаются «чинить» lockfile и вызывают yarn config get registry
		NEXT_IGNORE_INCORRECT_LOCKFILE: '1',
		DATABASE_URL: '',
		AUTH_JWT_SECRET: '',
	}
	for (const key of webEnvFileKeys(webDir)) {
		if (!(key in webEnv)) webEnv[key] = ''
	}
	return webEnv
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

	for (const key of ['DATABASE_URL', 'AUTH_JWT_SECRET']) {
		if (env[key] !== '') violations.push(`${key}: must be empty, app/web does not read it (ADR-0001)`)
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
