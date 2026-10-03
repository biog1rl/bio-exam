/**
 * yarn e2e: изолированный сквозной прогон (D-15, D-16, D-17, D-18, D-29).
 *
 * Порядок: сборка packages/rbac -> одноразовый PostgreSQL 17 и временная база test_e2e_*
 * (withTestDatabase) -> миграции настоящим раннером -> детерминированный сид (БД + prompt.md
 * в локальном хранилище) -> проба изоляции Express -> защита окружения Next (--check) ->
 * next build с e2e API_ORIGIN -> playwright test (Express и Next стартуют как webServer) ->
 * всё удаляется: серверы, временный каталог хранилища, база, кластер.
 *
 * Флаги:
 *   --seed-only  остановиться после сида (отладка фикстур); rbac всё равно собирается
 *   --no-build   не пересобирать web; только вместе с явными E2E_API_PORT и E2E_WEB_PORT,
 *                совпадающими с прошлой сборкой (rewrites фиксируются в next build)
 *   остальные аргументы передаются в playwright test (например --grep @flow1)
 *
 * Дочерние процессы получают только изолированное окружение (isolatedChildEnv): без
 * DATABASE_URL, SUPABASE_* и PG*, с BIO_EXAM_ISOLATED_ENV=1 и временной TEST_DATABASE_URL.
 * URL и секреты никогда не печатаются.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildWebEnv } from './lib/e2e-web-env.mjs'
import { isolatedChildEnv, withTestDatabase } from './lib/test-db.mjs'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SEED_FILE = path.join(REPO_ROOT, 'e2e', 'fixtures', 'seed.json')
const PLAYWRIGHT_CONFIG = path.join('e2e', 'playwright.config.ts')
// CLI Playwright напрямую через node, без yarn-обёртки: SIGINT/SIGTERM доходят до него без посредника
const PLAYWRIGHT_CLI = path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
const WEB_GUARD = path.join('scripts', 'lib', 'e2e-web-env.mjs')
const STORAGE_PREFIX = 'bio-exam-e2e-storage-'

// Тестовые значения только для процессов, которые запускает этот скрипт (T-1-27)
const E2E_JWT_SECRET = 'e2e-only-jwt-secret-not-for-production'
const E2E_SESSION_COOKIE = 'bio_exam_session'

function parseArgs(argv) {
	const options = { seedOnly: false, noBuild: false, passThrough: [] }
	for (const arg of argv) {
		if (arg === '--seed-only') options.seedOnly = true
		else if (arg === '--no-build') options.noBuild = true
		else options.passThrough.push(arg)
	}
	return options
}

/** Свободный TCP-порт на 127.0.0.1 */
function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer()
		server.unref()
		server.on('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address()
			server.close(() => resolve(port))
		})
	})
}

/** Текущий дочерний процесс: ему пересылаются SIGINT/SIGTERM (SIGHUP — как SIGTERM) */
let activeChild = null

/** Запуск шага с наследованием вывода; бросает при ненулевом коде */
function runStep(label, command, args, env) {
	return new Promise((resolve, reject) => {
		console.error(`[e2e] ${label}`)
		const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' })
		activeChild = child
		child.on('error', (error) => {
			activeChild = null
			reject(new Error(`${label}: could not start ${command}: ${error.message}`))
		})
		child.on('exit', (code, signal) => {
			activeChild = null
			if (code === 0) resolve()
			else reject(new Error(`${label} failed (${signal ?? `exit ${code}`})`))
		})
	})
}

/** Запуск с захватом stdout (stderr наследуется); бросает при ненулевом коде */
function captureStep(label, command, args, env) {
	return new Promise((resolve, reject) => {
		console.error(`[e2e] ${label}`)
		const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] })
		activeChild = child
		let stdout = ''
		child.stdout.on('data', (chunk) => (stdout += chunk))
		child.on('error', (error) => {
			activeChild = null
			reject(new Error(`${label}: could not start ${command}: ${error.message}`))
		})
		child.on('exit', (code, signal) => {
			activeChild = null
			if (code === 0) resolve(stdout)
			else reject(new Error(`${label} failed (${signal ?? `exit ${code}`})`))
		})
	})
}

/**
 * Проба изоляции Express в окружении настоящего прогона (D-29): .env не загружен,
 * SUPABASE_* не заданы, пул подключён к test_e2e_*. Значения проба не печатает.
 */
async function checkExpressIsolation(env) {
	const stdout = await captureStep(
		'isolation probe (Express environment)',
		'yarn',
		['workspace', '@bio-exam/server', 'tsx', 'src/scripts/isolation-probe.ts'],
		env
	)
	const line = stdout
		.split('\n')
		.map((item) => item.trim())
		.filter((item) => item.startsWith('{'))
		.pop()
	if (!line) throw new Error('isolation probe printed no JSON line')
	const probe = JSON.parse(line)
	const problems = []
	if (probe.envLoadedFrom !== null) problems.push('a .env file was loaded')
	if (probe.supabaseUrlSet !== false) problems.push('supabaseUrlSet is not false')
	if (probe.supabaseKeySet !== false) problems.push('supabaseKeySet is not false')
	if (typeof probe.database !== 'string' || !probe.database.startsWith('test_e2e_')) {
		problems.push('the pool is not connected to a test_e2e_* database')
	}
	if (problems.length > 0) throw new Error(`Express isolation failed: ${problems.join('; ')}`)
	console.error(`[e2e] isolation probe OK (envLoadedFrom null, no SUPABASE_*, database ${probe.database})`)
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	if (options.noBuild && !(process.env.E2E_API_PORT && process.env.E2E_WEB_PORT)) {
		throw new Error('--no-build needs E2E_API_PORT and E2E_WEB_PORT that match the existing web build')
	}

	// 1. rbac до кластера: @bio-exam/rbac указывает на dist, dist в .gitignore, а сид импортирует ROLE_KEYS
	await runStep('build packages/rbac', 'yarn', ['workspace', '@bio-exam/rbac', 'build'], isolatedChildEnv({}))

	await withTestDatabase('test_e2e', async ({ url, name }) => {
		console.error(`[e2e] scratch database ${name}`)
		const apiPort = Number(process.env.E2E_API_PORT || (await getFreePort()))
		const webPort = Number(process.env.E2E_WEB_PORT || (await getFreePort()))
		const storageDir = await fsp.mkdtemp(path.join(os.tmpdir(), STORAGE_PREFIX))

		// Прерывание: остановить текущий шаг и удалить каталог хранилища; базу и кластер удаляет withTestDatabase
		const onSignal = (signal) => () => {
			if (activeChild && activeChild.exitCode === null) activeChild.kill(signal)
			fs.rmSync(storageDir, { recursive: true, force: true })
		}
		const onSigint = onSignal('SIGINT')
		const onSigterm = onSignal('SIGTERM')
		process.on('SIGINT', onSigint)
		process.on('SIGTERM', onSigterm)
		process.on('SIGHUP', onSigterm)

		try {
			const childEnv = isolatedChildEnv({
				TEST_DATABASE_URL: url,
				STORAGE_DRIVER: 'local',
				STORAGE_LOCAL_DIR: storageDir,
				AUTH_JWT_SECRET: E2E_JWT_SECRET,
				SESSION_COOKIE_NAME: E2E_SESSION_COOKIE,
				E2E_SEED_FILE: SEED_FILE,
				E2E_API_PORT: String(apiPort),
				E2E_WEB_PORT: String(webPort),
				NEXT_TELEMETRY_DISABLED: '1',
			})
			// NODE_ENV из оболочки разработчика не передаётся: production заставил бы config/env.ts
			// требовать вырезанный DATABASE_URL при миграции и сиде. Каждый сервер задаёт его сам.
			delete childEnv.NODE_ENV

			await runStep('migrate', 'yarn', ['workspace', '@bio-exam/server', 'drizzle:migrate'], childEnv)
			await runStep('seed', 'yarn', ['workspace', '@bio-exam/server', 'tsx', 'src/scripts/e2e-seed.ts'], childEnv)

			if (options.seedOnly) {
				console.error('[e2e] --seed-only: stopping after the seed')
				return
			}

			// Express: NODE_ENV=development только для него (Pitfall 12), как в его webServer
			await checkExpressIsolation({ ...childEnv, NODE_ENV: 'development' })

			// Next: одно определение окружения для build и start, сверх него @next/env нечего заполнить
			const webEnv = buildWebEnv(childEnv)
			const buildEnv = { ...childEnv, ...webEnv }
			await runStep('web environment guard (next build)', process.execPath, [WEB_GUARD, '--check'], buildEnv)
			if (options.noBuild) {
				console.error('[e2e] --no-build: reusing the existing app/web build')
			} else {
				await runStep('next build (e2e API origin)', 'yarn', ['workspace', '@bio-exam/web', 'build'], buildEnv)
			}

			// Playwright получает окружение Next целиком (тестовые значения и временный URL; не печатается)
			await runStep(
				'playwright test',
				process.execPath,
				[PLAYWRIGHT_CLI, 'test', '--config', PLAYWRIGHT_CONFIG, ...options.passThrough],
				{ ...childEnv, E2E_WEB_ENV: JSON.stringify(webEnv) }
			)
		} finally {
			process.off('SIGINT', onSigint)
			process.off('SIGTERM', onSigterm)
			process.off('SIGHUP', onSigterm)
			await fsp.rm(storageDir, { recursive: true, force: true })
		}
	})
}

main().then(
	() => process.exit(0),
	(error) => {
		console.error(`[e2e] ${error && error.message ? error.message : String(error)}`)
		process.exit(1)
	}
)
