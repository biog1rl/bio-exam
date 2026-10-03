/**
 * Тесты отказов изоляции без базы и без кластера PostgreSQL (D-29, VER-05, D-03).
 * Запуск: node --test scripts/lib/isolation-guards.test.mjs
 * Дочерние процессы получают окружение только из isolatedChildEnv: без DATABASE_URL, SUPABASE_*, PG*.
 * Жизненный цикл кластера (снос, SIGINT, параллельные запуски, очистка сирот) остаётся в ручной
 * самопроверке: node scripts/lib/test-db.mjs --self-test
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { findPgBin, isolatedChildEnv, isStrippedEnvKey } from './test-db.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SERVER = ['workspace', '@bio-exam/server']
const REMOTE = 'postgres://u@db.example.invalid:5432/test_x'
const NOT_TEST_NAME = 'postgres://u@127.0.0.1:5432/prod'
// Локальный адрес с допустимым именем: приманка для DATABASE_URL, подключение к порту 1 невозможно
const LURE = 'postgres://u@127.0.0.1:1/test_lure'

/** Запуск с захватом вывода; env обязателен и берётся из isolatedChildEnv */
function run(args, env) {
	return new Promise((resolve) => {
		const child = spawn('yarn', args, { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
		let output = ''
		child.stdout.on('data', (chunk) => (output += chunk))
		child.stderr.on('data', (chunk) => (output += chunk))
		child.on('error', (error) => resolve({ code: -1, output: output + error.message }))
		child.on('close', (code) => resolve({ code, output }))
	})
}

const probe = (env) => run([...SERVER, 'tsx', 'src/scripts/isolation-probe.ts'], env)
const migrate = (env) => run([...SERVER, 'drizzle:migrate'], env)
const configProbe = (env) =>
	run(
		[
			...SERVER,
			'tsx',
			'-e',
			"import('./drizzle.config.ts').then(() => process.exit(0), (e) => { console.error(String(e && e.message)); process.exit(3) })",
		],
		env
	)

const RUNNERS = [
	['isolation-probe', probe],
	['migration runner', migrate],
	['drizzle.config.ts', configProbe],
]

/** Отказ случился до подключения: есть сообщение защиты, нет следов сети и миграций */
function assertRefusedBeforeConnect(result, fragment) {
	assert.notEqual(result.code, 0, `exit 0, output:\n${result.output}`)
	assert.ok(result.output.includes(fragment), `guard message "${fragment}" absent:\n${result.output}`)
	assert.ok(!/ENOTFOUND|ECONNREFUSED|Running migrations/.test(result.output), `connection attempted:\n${result.output}`)
}

for (const [name, runner] of RUNNERS) {
	test(`${name}: удалённый хост отклоняется до подключения`, async () => {
		const result = await runner(isolatedChildEnv({ TEST_DATABASE_URL: REMOTE }))
		assertRefusedBeforeConnect(result, 'TEST_DATABASE_URL host db.example.invalid')
	})

	test(`${name}: база без префикса test_ отклоняется до подключения`, async () => {
		const result = await runner(isolatedChildEnv({ TEST_DATABASE_URL: NOT_TEST_NAME }))
		assertRefusedBeforeConnect(result, 'TEST_DATABASE_URL database prod does not match')
	})

	test(`${name}: без TEST_DATABASE_URL нет отката на DATABASE_URL`, async () => {
		const env = isolatedChildEnv({ DATABASE_URL: LURE })
		delete env.TEST_DATABASE_URL
		const result = await runner(env)
		assertRefusedBeforeConnect(result, 'TEST_DATABASE_URL is not set')
	})
}

test('isolatedChildEnv убирает DATABASE_URL, SUPABASE_* и PG* и ставит флаг изоляции', () => {
	const poison = {
		DATABASE_URL: 'postgres://poison@poison.invalid/x',
		SUPABASE_URL: 'https://poison.invalid',
		SUPABASE_SERVICE_KEY: 'poison',
		SUPABASE_STORAGE_BUCKET: 'poison',
		PGHOST: 'poison.invalid',
		PGPORT: '1',
		PGUSER: 'poison',
		PGPASSWORD: 'poison',
		PGDATABASE: 'poison',
		PGSERVICE: 'poison',
		// H-3: отбор по шаблону, а не по списку имён
		PGHOSTADDR: '192.0.2.1',
		PGPASSFILE: '/poison/pgpass',
		PGSERVICEFILE: '/poison/pg_service.conf',
		PGOPTIONS: '-c poison=on',
		SUPABASE_ANON_KEY: 'poison',
		BIO_EXAM_ISOLATED_ENV: '0',
	}
	// Переменные проекта с подчёркиванием после PG не относятся к libpq и остаются
	const kept = { PG_BIN_DIR: '/kept/bin', PG_FORCE_SSL: '1', PG_POOL_MAX: '7' }
	const saved = {}
	for (const key of [...Object.keys(poison), ...Object.keys(kept)]) saved[key] = process.env[key]
	Object.assign(process.env, poison, kept)
	let env
	try {
		env = isolatedChildEnv()
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
	for (const key of Object.keys(poison)) {
		if (key !== 'BIO_EXAM_ISOLATED_ENV') assert.equal(env[key], undefined, `${key} leaked`)
	}
	for (const [key, value] of Object.entries(kept)) assert.equal(env[key], value, `${key} was stripped`)
	assert.equal(env.BIO_EXAM_ISOLATED_ENV, '1')
})

test('isStrippedEnvKey: DATABASE_URL, SUPABASE_* и PG<БУКВЫ> вырезаются, PG_* проекта остаются', () => {
	for (const key of [
		'DATABASE_URL',
		'SUPABASE_URL',
		'SUPABASE_X',
		'PGHOST',
		'PGHOSTADDR',
		'PGPASSFILE',
		'PGSERVICEFILE',
	]) {
		assert.equal(isStrippedEnvKey(key), true, key)
	}
	for (const key of ['PG_BIN_DIR', 'PG_FORCE_SSL', 'PG_POOL_MAX', 'TEST_DATABASE_URL', 'PATH', 'PG', 'XPGHOST']) {
		assert.equal(isStrippedEnvKey(key), false, key)
	}
})

test('findPgBin с исключительным PG_BIN_DIR=/nonexistent просит установить PostgreSQL 17', () => {
	assert.throws(
		() => findPgBin({ PG_BIN_DIR: '/nonexistent', PATH: process.env.PATH }),
		(error) =>
			/PostgreSQL 17 not found: brew install postgresql@17/.test(error.message) && error.message.includes('PG_BIN_DIR')
	)
})

test('D-03: DB-тест без TEST_DATABASE_URL падает с подсказкой with-test-db, а не пропускается', async () => {
	const env = isolatedChildEnv()
	delete env.TEST_DATABASE_URL
	const result = await run([...SERVER, 'vitest', 'run', 'src/db/timestamps.test.ts'], env)
	assert.notEqual(result.code, 0, `exit 0, output:\n${result.output}`)
	assert.ok(result.output.includes('with-test-db'), `hint absent:\n${result.output}`)
	// Тесты внутри помечаются skipped из-за упавшего beforeAll; важно, что набор упал, а не пропущен целиком
	assert.match(result.output, /Failed Suites 1/, result.output)
	assert.ok(!/Test Files\s+\d+ skipped/.test(result.output), `file was skipped:\n${result.output}`)
})
