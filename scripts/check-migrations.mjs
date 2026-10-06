/**
 * Проверка миграций (DRZ-01..03): один скрипт на весь контракт миграций, только на временных базах.
 *
 * Этапы (каждый печатает «ok - <этап>» или «not ok - <этап>» с подробностями):
 *  1. manifest — журнал, app/server/drizzle/migrations-manifest.json и файлы *.sql совпадают:
 *     одно и то же число записей, те же теги в том же порядке, sha256 каждого файла как в манифесте,
 *     when и breakpoints каждой записи журнала как в манифесте; when в журнале строго возрастает.
 *  2. chain-vs-schema (DRZ-01) — цепочка 0000-0027 и schema.ts описывают одну и ту же базу:
 *     сторона миграций — настоящий раннер (yarn workspace @bio-exam/server drizzle:migrate) в
 *     изолированном окружении против test_migchk_chain; сторона schema.ts — DDL от drizzle-kit
 *     generate во временный каталог, выполненный одной транзакцией в test_migchk_decl (перед ним
 *     pg_trgm в схеме extensions, как после 0017/0018). Отпечатки каталогов сравниваются.
 *  3. idempotency — повторный запуск раннера на той же базе ничего не применяет, а
 *     public.__drizzle_migrations хранит ровно хэши манифеста в порядке журнала.
 *  4. generate-no-diff (DRZ-02) — drizzle-kit generate на копии app/server/drizzle не создаёт и не
 *     меняет ни одного файла. Новый SQL печатается; DROP в нём — STOP по плану 009.
 *  5. drizzle-check — drizzle-kit check на копии завершается с кодом 0 и без предупреждений.
 *
 * drizzle-kit всегда запускается без флага файла конфигурации (drizzle.config.ts и его dotenv не
 * читаются, базы drizzle-kit не касается) и пишет только во временные каталоги. --out передаётся
 * путём относительно app/server: drizzle-kit 0.31.11 читает снимки как `./${путь}`, и абсолютный
 * путь к каталогу со снимками ломается. app/server/drizzle не меняется (git status до и после).
 * Базы, каталоги и кластер удаляются всегда, в том числе по SIGINT/SIGTERM. URL не печатается.
 *
 * Выход: 0 — «check-migrations: OK»; 1 — «check-migrations: FAILED (<этапы>)».
 */
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertTestDatabaseUrl } from '../app/server/src/config/test-database-url.ts'
import { diffFingerprints, fingerprintDatabase } from './lib/schema-fingerprint.mjs'
import { acquireTestServer, assertDatabaseSettings, createScratchDatabase, isolatedChildEnv } from './lib/test-db.mjs'

// pg берём из зависимостей серверного воркспейса, новых зависимостей нет
const requireFromServer = createRequire(new URL('../app/server/package.json', import.meta.url))
const pg = requireFromServer('pg')

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SERVER_DIR = path.join(REPO_ROOT, 'app/server')
const MIGRATIONS_DIR = 'app/server/drizzle'
const MIGRATIONS_PATH = path.join(REPO_ROOT, MIGRATIONS_DIR)
const MANIFEST_FILE = 'migrations-manifest.json'
const JOURNAL_FILE = 'meta/_journal.json'
const DECL_TMP_PREFIX = 'bio-exam-drizzle-decl-'
const KIT_TMP_PREFIX = 'bio-exam-drizzle-kit-'
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const SERVER_WORKSPACE = ['workspace', '@bio-exam/server']
export const STOP_MESSAGE = 'STOP (plan 009): generated diff proposes destructive statements'

// Временные каталоги этапов: удаляются в finally этапа, а по сигналу — в очистке main()
const activeTmpDirs = new Set()

/** Запуск команды с захватом вывода; stdin закрыт, чтобы интерактивный вопрос прерывал, а не вешал */
function run(cmd, args, options = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
		let stdout = ''
		let stderr = ''
		child.stdout?.on('data', (chunk) => (stdout += chunk))
		child.stderr?.on('data', (chunk) => (stderr += chunk))
		child.on('error', (error) => resolve({ code: -1, stdout, stderr: stderr + String(error.message) }))
		child.on('close', (code) => resolve({ code, stdout, stderr }))
	})
}

/** Последние строки вывода для сообщений об ошибке */
function tail(text, lines = 20) {
	return String(text ?? '')
		.trimEnd()
		.split('\n')
		.slice(-lines)
		.join('\n')
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function readJson(file) {
	return JSON.parse(await fsp.readFile(file, 'utf8'))
}

/** Состояние app/server/drizzle в git (пустая строка — без изменений) */
function migrationsStatus() {
	return execFileSync('git', ['status', '--porcelain', MIGRATIONS_DIR], { cwd: REPO_ROOT, encoding: 'utf8' })
}

/** Аргумент --out для drizzle-kit: путь относительно app/server, где yarn workspace запускает команду */
function kitOutArg(dir) {
	return `--out=${path.relative(SERVER_DIR, dir)}`
}

async function makeTmpDir(prefix) {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix))
	activeTmpDirs.add(dir)
	return dir
}

async function removeTmpDir(dir) {
	await fsp.rm(dir, { recursive: true, force: true })
	activeTmpDirs.delete(dir)
}

/** Копия каталога миграций во временный каталог: drizzle-kit пишет только туда */
async function copyMigrations(sourceDir) {
	const dir = await makeTmpDir(KIT_TMP_PREFIX)
	await fsp.cp(sourceDir, dir, { recursive: true })
	return dir
}

/** sha256 всех файлов каталога по относительному пути */
async function fileHashes(dir) {
	const hashes = new Map()
	const walk = async (sub) => {
		for (const entry of await fsp.readdir(path.join(dir, sub), { withFileTypes: true })) {
			const rel = path.join(sub, entry.name)
			if (entry.isDirectory()) await walk(rel)
			else hashes.set(rel, sha256(await fsp.readFile(path.join(dir, rel))))
		}
	}
	await walk('')
	return hashes
}

function splitStatements(sql) {
	return sql
		.split(STATEMENT_BREAKPOINT)
		.map((statement) => statement.trim())
		.filter(Boolean)
}

// ---------------------------------------------------------------------------
// Этап 1: manifest
// ---------------------------------------------------------------------------

/** Журнал, манифест и файлы *.sql описывают одну и ту же историю, байт в байт */
export async function checkManifest(dir = MIGRATIONS_PATH) {
	const lines = []
	const journal = await readJson(path.join(dir, JOURNAL_FILE))
	const manifest = await readJson(path.join(dir, MANIFEST_FILE))
	const entries = Array.isArray(journal.entries) ? journal.entries : []
	const pinned = Array.isArray(manifest.migrations) ? manifest.migrations : []
	const sqlFiles = (await fsp.readdir(dir)).filter((file) => file.endsWith('.sql')).sort()

	if (manifest.checksumAlgorithm !== 'sha256') {
		lines.push(`${MANIFEST_FILE}: checksumAlgorithm ${String(manifest.checksumAlgorithm)} is not sha256`)
	}
	if (entries.length !== pinned.length || pinned.length !== sqlFiles.length) {
		lines.push(`count: journal ${entries.length}, manifest ${pinned.length}, .sql files ${sqlFiles.length}`)
	}

	// Порядок: позиция i журнала — та же миграция, что позиция i манифеста
	for (let i = 0; i < Math.max(entries.length, pinned.length); i++) {
		const entry = entries[i]
		const expected = pinned[i]
		if (!entry) {
			lines.push(`order: manifest position ${i} ${expected.tag} has no journal entry`)
			continue
		}
		if (!expected) {
			lines.push(`order: journal position ${i} ${entry.tag} is not in the manifest`)
			continue
		}
		if (entry.tag !== expected.tag) {
			lines.push(`order: journal position ${i} is ${entry.tag}, manifest expects ${expected.tag}`)
		}
		if (entry.idx !== i) lines.push(`order: journal position ${i} ${entry.tag} has idx ${entry.idx}`)
		if (expected.idx !== i || expected.file !== `${expected.tag}.sql`) {
			lines.push(`${MANIFEST_FILE}: position ${i} has idx ${expected.idx} and file ${expected.file}`)
		}
		// when решает, что применит раннер drizzle в production (created_at последней записи < when),
		// поэтому он закреплён в манифесте вместе с breakpoints
		if (entry.when !== expected.when) {
			lines.push(
				`order: journal position ${i} ${entry.tag} when ${entry.when} differs from the manifest ${expected.when}`
			)
		}
		if (entry.breakpoints !== expected.breakpoints) {
			lines.push(
				`order: journal position ${i} ${entry.tag} breakpoints ${entry.breakpoints} differs from the manifest ${expected.breakpoints}`
			)
		}
	}

	// Монотонность: запись с when не больше предыдущего drizzle 0.45.3 в production молча пропускает
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]
		if (!entry) continue
		if (!Number.isSafeInteger(entry.when) || entry.when <= 0) {
			lines.push(`order: journal position ${i} ${entry.tag} when ${entry.when} is not a positive integer`)
			continue
		}
		const previous = entries[i - 1]
		if (i > 0 && previous && Number.isSafeInteger(previous.when) && entry.when <= previous.when) {
			lines.push(
				`order: journal position ${i} ${entry.tag} when ${entry.when} is not greater than the previous entry ${previous.tag} when ${previous.when}`
			)
		}
	}

	// Содержимое: каждый файл манифеста существует и не изменён
	for (const expected of pinned) {
		let bytes
		try {
			bytes = await fsp.readFile(path.join(dir, expected.file))
		} catch {
			lines.push(`${expected.file}: missing`)
			continue
		}
		const actual = sha256(bytes)
		if (actual !== expected.sha256) {
			lines.push(`${expected.file}: sha256 ${actual} differs from the manifest ${expected.sha256}`)
		}
	}

	// Лишние файлы: SQL без записи в журнале или манифесте стал бы миграцией незаметно
	const journalFiles = new Set(entries.map((entry) => `${entry.tag}.sql`))
	const pinnedFiles = new Set(pinned.map((expected) => expected.file))
	for (const file of sqlFiles) {
		if (!journalFiles.has(file)) lines.push(`${file}: not in ${JOURNAL_FILE}`)
		else if (!pinnedFiles.has(file)) lines.push(`${file}: not in ${MANIFEST_FILE}`)
	}
	for (const file of journalFiles) {
		if (!pinnedFiles.has(file) && !sqlFiles.includes(file)) lines.push(`${file}: in the journal, but missing`)
	}

	return { ok: lines.length === 0, lines }
}

// ---------------------------------------------------------------------------
// Этап 2: chain-vs-schema (DRZ-01)
// ---------------------------------------------------------------------------

/** Сторона миграций: настоящий раннер против временной базы */
async function runMigrator(url) {
	const result = await run('yarn', [...SERVER_WORKSPACE, 'drizzle:migrate'], {
		cwd: REPO_ROOT,
		env: isolatedChildEnv({ TEST_DATABASE_URL: url }),
	})
	if (result.code !== 0) {
		throw new Error(`drizzle:migrate exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
	}
}

/** DDL, который drizzle-kit generate выводит из schema.ts, во временный каталог */
async function generateDeclaredSql(outDir) {
	const result = await run(
		'yarn',
		[
			...SERVER_WORKSPACE,
			'drizzle-kit',
			'generate',
			'--dialect=postgresql',
			'--schema=./src/db/schema.ts',
			kitOutArg(outDir),
			'--name=declared',
		],
		{ cwd: REPO_ROOT, env: isolatedChildEnv() }
	)
	if (result.code !== 0) {
		throw new Error(`drizzle-kit generate exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
	}
	const files = (await fsp.readdir(outDir)).filter((file) => file.endsWith('.sql'))
	if (files.length !== 1) {
		throw new Error(`drizzle-kit generate produced ${files.length} .sql files, expected 1:\n${tail(result.stdout)}`)
	}
	return fsp.readFile(path.join(outDir, files[0]), 'utf8')
}

/** Сторона schema.ts: DDL в одной транзакции; pg_trgm в extensions, как после 0017/0018 */
async function applyDeclaredSql(url, sql) {
	const statements = splitStatements(sql)
	const client = new pg.Client({ connectionString: assertTestDatabaseUrl(url) })
	await client.connect()
	try {
		await client.query('BEGIN')
		await client.query('CREATE SCHEMA IF NOT EXISTS extensions')
		await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions')
		await client.query('SET LOCAL search_path TO public, extensions')
		for (const statement of statements) {
			try {
				await client.query(statement)
			} catch (error) {
				throw new Error(`declared DDL failed: ${error.message}\n  in: ${statement.split('\n')[0].slice(0, 160)}`)
			}
		}
		await client.query('COMMIT')
		return statements.length
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {})
		throw error
	} finally {
		await client.end()
	}
}

/** Этап DRZ-01: цепочка и schema.ts дают одинаковый каталог */
export async function compareChainWithSchema({ chain, decl, tmpDir }) {
	await runMigrator(chain.url)
	console.error(`[check-migrations] chain applied to ${chain.name}`)

	const statusBefore = migrationsStatus()
	const sql = await generateDeclaredSql(tmpDir)
	const statusAfter = migrationsStatus()
	if (statusAfter !== statusBefore) {
		throw new Error(`drizzle-kit generate changed ${MIGRATIONS_DIR}:\n${statusAfter}`)
	}
	const count = await applyDeclaredSql(decl.url, sql)
	console.error(`[check-migrations] schema.ts DDL (${count} statements) applied to ${decl.name}`)

	const [chainPrint, declPrint] = await Promise.all([fingerprintDatabase(chain.url), fingerprintDatabase(decl.url)])
	const differences = diffFingerprints(chainPrint, declPrint, ['migrations', 'schema.ts'])
	if (differences.length === 0) {
		console.log('DRZ-01: chain == schema.ts')
		return { ok: true, lines: [] }
	}
	console.log('DRZ-01 FAILED: migrations and schema.ts differ')
	return { ok: false, lines: [...differences, `(${differences.length} differences)`] }
}

// ---------------------------------------------------------------------------
// Этап 3: idempotency
// ---------------------------------------------------------------------------

/** Записи раннера в порядке применения */
async function readAppliedMigrations(url) {
	const client = new pg.Client({ connectionString: assertTestDatabaseUrl(url) })
	await client.connect()
	try {
		const { rows } = await client.query(
			'SELECT hash, created_at FROM public.__drizzle_migrations ORDER BY created_at, id'
		)
		return rows.map((row) => ({ hash: row.hash, createdAt: String(row.created_at) }))
	} finally {
		await client.end()
	}
}

/**
 * Повторный запуск раннера на базе, где цепочка уже применена: ничего не применяется, а
 * __drizzle_migrations хранит хэши манифеста и `when` журнала в порядке журнала.
 */
export async function checkIdempotency(url, dir = MIGRATIONS_PATH) {
	const manifest = await readJson(path.join(dir, MANIFEST_FILE))
	const journal = await readJson(path.join(dir, JOURNAL_FILE))
	const expected = manifest.migrations.map((pinned, i) => ({
		tag: pinned.tag,
		hash: pinned.sha256,
		createdAt: String(journal.entries[i]?.when),
	}))
	const lines = []
	const first = await readAppliedMigrations(url)
	await runMigrator(url)
	const second = await readAppliedMigrations(url)

	if (first.length !== expected.length)
		lines.push(`after the first run: ${first.length} rows, manifest ${expected.length}`)
	if (second.length !== first.length) lines.push(`the second run applied ${second.length - first.length} migrations`)
	for (let i = 0; i < Math.max(second.length, expected.length); i++) {
		const row = second[i]
		const want = expected[i]
		if (!row || !want) {
			lines.push(`position ${i}: ${row ? `extra row ${row.hash}` : `${want.tag} not applied`}`)
			continue
		}
		if (row.hash !== want.hash) lines.push(`position ${i} ${want.tag}: hash ${row.hash} differs from the manifest`)
		if (row.createdAt !== want.createdAt) {
			lines.push(`position ${i} ${want.tag}: created_at ${row.createdAt} differs from journal when ${want.createdAt}`)
		}
	}
	return { ok: lines.length === 0, lines, rows: second.length }
}

// ---------------------------------------------------------------------------
// Этап 4: generate-no-diff (DRZ-02)
// ---------------------------------------------------------------------------

/**
 * drizzle-kit generate на копии каталога миграций не создаёт и не меняет файлов. Если SQL всё же
 * появился, его операторы печатаются; DROP среди них — STOP плана 009 (не применять, не отвечать).
 */
export async function checkGenerateNoDiff(sourceDir = MIGRATIONS_PATH) {
	const copy = await copyMigrations(sourceDir)
	try {
		const before = await fileHashes(copy)
		const result = await run(
			'yarn',
			[
				...SERVER_WORKSPACE,
				'drizzle-kit',
				'generate',
				'--dialect=postgresql',
				'--schema=./src/db/schema.ts',
				kitOutArg(copy),
			],
			{ cwd: REPO_ROOT, env: isolatedChildEnv() }
		)
		const after = await fileHashes(copy)

		const lines = []
		if (result.code !== 0)
			lines.push(`drizzle-kit generate exited ${result.code}:`, tail(result.stdout + result.stderr))
		const added = [...after.keys()].filter((file) => !before.has(file)).sort()
		const changed = [...before.keys()].filter((file) => after.has(file) && after.get(file) !== before.get(file)).sort()
		const removed = [...before.keys()].filter((file) => !after.has(file)).sort()
		for (const file of added) lines.push(`generate added ${file}`)
		for (const file of changed) lines.push(`generate changed ${file}`)
		for (const file of removed) lines.push(`generate removed ${file}`)

		const statements = []
		for (const file of added.filter((name) => name.endsWith('.sql'))) {
			statements.push(...splitStatements(await fsp.readFile(path.join(copy, file), 'utf8')))
		}
		if (statements.length > 0) {
			lines.push(`generated statements (${statements.length}):`)
			for (const statement of statements) lines.push(`  ${statement.replace(/\s+/g, ' ').slice(0, 200)}`)
		}
		const destructive = statements.some((statement) => /\bDROP\b/i.test(statement))
		if (destructive) lines.push(STOP_MESSAGE)

		const ok = result.code === 0 && added.length === 0 && changed.length === 0 && removed.length === 0
		const kitSummary = tail(result.stdout, 1)
		return { ok, destructive, statements, lines, kitSummary }
	} finally {
		await removeTmpDir(copy)
	}
}

// ---------------------------------------------------------------------------
// Этап 5: drizzle-check
// ---------------------------------------------------------------------------

/** drizzle-kit check на копии: код 0, «Everything's fine», без предупреждений о журнале */
export async function checkDrizzleCheck(sourceDir = MIGRATIONS_PATH) {
	const copy = await copyMigrations(sourceDir)
	try {
		const result = await run(
			'yarn',
			[...SERVER_WORKSPACE, 'drizzle-kit', 'check', '--dialect=postgresql', kitOutArg(copy)],
			{
				cwd: REPO_ROOT,
				env: isolatedChildEnv(),
			}
		)
		const output = result.stdout + result.stderr
		const ok = result.code === 0 && output.includes("Everything's fine") && !/\bWarning:/.test(output)
		const lines = ok ? [] : [`drizzle-kit check exited ${result.code}:`, tail(output)]
		return { ok, lines, kitSummary: tail(result.stdout, 1) }
	} finally {
		await removeTmpDir(copy)
	}
}

// ---------------------------------------------------------------------------
// Запуск всех этапов
// ---------------------------------------------------------------------------

/** Версия сервера и настройки временной базы для отчёта (без URL) */
async function describeDatabase(scratch) {
	const settings = await assertDatabaseSettings(scratch.url)
	const client = new pg.Client({ connectionString: assertTestDatabaseUrl(scratch.url) })
	await client.connect()
	try {
		const { rows } = await client.query('SHOW server_version')
		return (
			`${scratch.name}: server_version ${rows[0].server_version}, encoding ${settings.encoding}, ` +
			`datcollate ${settings.datcollate}, datctype ${settings.datctype}, TimeZone ${settings.timezone}`
		)
	} finally {
		await client.end()
	}
}

async function main() {
	let serverPromise = null
	const scratchPromises = []
	let cleanupPromise = null
	const cleanup = () => {
		cleanupPromise ??= (async () => {
			// Ждём и незавершённое создание: база или кластер, появившиеся в момент сигнала, тоже удаляются
			for (const promise of scratchPromises) {
				const scratch = await promise.catch(() => null)
				if (scratch)
					await scratch.drop().catch((error) => console.error(`[check-migrations] drop failed: ${error.message}`))
			}
			for (const dir of [...activeTmpDirs]) await removeTmpDir(dir)
			const server = serverPromise ? await serverPromise.catch(() => null) : null
			if (server)
				await server.stop().catch((error) => console.error(`[check-migrations] stop failed: ${error.message}`))
		})()
		return cleanupPromise
	}
	const onSignal = (signal, code) => () => {
		console.error(`[check-migrations] ${signal}: cleaning up`)
		cleanup().finally(() => process.exit(code))
	}
	const onSigint = onSignal('SIGINT', 130)
	const onSigterm = onSignal('SIGTERM', 143)
	process.on('SIGINT', onSigint)
	process.on('SIGTERM', onSigterm)

	const failures = []
	const stage = async (name, fn) => {
		try {
			const result = await fn()
			console.log(result.ok ? `ok - ${name}` : `not ok - ${name}`)
			for (const line of result.lines) console.log(`  ${line}`)
			if (result.kitSummary) console.error(`[check-migrations] ${name}: ${result.kitSummary}`)
			if (!result.ok) failures.push(name)
		} catch (error) {
			console.log(`not ok - ${name}: ${error && error.message ? error.message : String(error)}`)
			failures.push(name)
		}
	}

	const statusBefore = migrationsStatus()
	try {
		await stage('manifest', () => checkManifest(MIGRATIONS_PATH))

		serverPromise = acquireTestServer()
		const server = await serverPromise
		const chainPromise = createScratchDatabase(server.adminUrl, 'test_migchk_chain')
		scratchPromises.push(chainPromise)
		const chain = await chainPromise
		const declPromise = createScratchDatabase(server.adminUrl, 'test_migchk_decl')
		scratchPromises.push(declPromise)
		const decl = await declPromise
		for (const scratch of [chain, decl]) console.error(`[check-migrations] ${await describeDatabase(scratch)}`)
		const tmpDir = await makeTmpDir(DECL_TMP_PREFIX)

		await stage('chain-vs-schema', () => compareChainWithSchema({ chain, decl, tmpDir }))
		await stage('idempotency', () => checkIdempotency(chain.url))
		await stage('generate-no-diff', () => checkGenerateNoDiff(MIGRATIONS_PATH))
		await stage('drizzle-check', () => checkDrizzleCheck(MIGRATIONS_PATH))
	} catch (error) {
		console.error(`[check-migrations] ${error && error.message ? error.message : String(error)}`)
		failures.push('setup')
	} finally {
		await cleanup()
		process.off('SIGINT', onSigint)
		process.off('SIGTERM', onSigterm)
	}

	const statusAfter = migrationsStatus()
	if (statusAfter !== statusBefore) {
		console.log(`not ok - ${MIGRATIONS_DIR} changed during the check:\n${statusAfter}`)
		failures.push('repository')
	}
	if (failures.length > 0) {
		console.log(`check-migrations: FAILED (${failures.join(', ')})`)
		return 1
	}
	console.log('check-migrations: OK')
	return 0
}

// Импорт из тестов не запускает проверку
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then((code) => process.exit(code))
}
