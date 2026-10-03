/**
 * Одноразовый PostgreSQL 17 для тестов, проверки миграций и e2e (D-01, D-02, D-03, D-29).
 *
 * - Локально: initdb/pg_ctl во временном каталоге os.tmpdir()/bio-exam-pg-*, свободный порт
 *   на 127.0.0.1, только TCP, trust-аутентификация, кластер удаляется после работы.
 * - CI: если задан TEST_DATABASE_URL (сервисный контейнер postgres:17), кластер не поднимается,
 *   но адрес всё равно проходит защиту assertTestDatabaseUrl.
 * - Каждый запуск работает в своей временной базе test_* (createScratchDatabase).
 * - Дочерние процессы получают изолированное окружение (isolatedChildEnv): без DATABASE_URL,
 *   SUPABASE_* и PG*, с BIO_EXAM_ISOLATED_ENV=1.
 *
 * URL никогда не печатается: в логах только хост, порт и имя базы.
 * Самопроверка: node scripts/lib/test-db.mjs --self-test
 */
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	assertTestDatabaseUrl,
	ISOLATED_ENV_FLAG,
	resolveIsolatedDatabaseUrl,
	withDatabaseName,
} from '../../app/server/src/config/test-database-url.ts'

// pg берём из зависимостей серверного воркспейса, новых зависимостей нет
const requireFromServer = createRequire(new URL('../../app/server/package.json', import.meta.url))
const pg = requireFromServer('pg')

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const CLUSTER_PREFIX = 'bio-exam-pg-'
const ADMIN_DATABASE = 'test_bio_exam'
const TEST_NAME = /^test_[a-z0-9_]+$/
const ORPHAN_MIN_AGE_MS = 10 * 60_000

/** Каталоги поиска PostgreSQL 17 после записей PATH */
const FIXED_PG_DIRS = [
	'/opt/homebrew/opt/postgresql@17/bin',
	'/usr/local/opt/postgresql@17/bin',
	'/usr/lib/postgresql/17/bin',
]

/**
 * Переменные, которые никогда не передаются изолированному дочернему процессу: DATABASE_URL, любые
 * SUPABASE_* и любые переменные libpq PG<БУКВЫ> (PGHOST, PGHOSTADDR, PGPASSFILE, PGSERVICEFILE,
 * PGOPTIONS и т. д.). Отбор по шаблону, а не по списку: новая переменная libpq не просочится.
 * Переменные проекта с подчёркиванием после PG (PG_BIN_DIR, PG_FORCE_SSL, PG_POOL_MAX) остаются.
 */
export function isStrippedEnvKey(key) {
	return key === 'DATABASE_URL' || /^SUPABASE_/.test(key) || /^PG(?!_)[A-Z]+$/.test(key)
}

/** Копия окружения без вырезаемых переменных */
function strippedEnv(source) {
	const env = { ...source }
	for (const key of Object.keys(env)) {
		if (isStrippedEnvKey(key)) delete env[key]
	}
	return env
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------

/** Запуск команды с захватом вывода; не бросает, возвращает код и вывод */
function run(cmd, args, options = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
		let stdout = ''
		let stderr = ''
		child.stdout?.on('data', (chunk) => (stdout += chunk))
		child.stderr?.on('data', (chunk) => (stderr += chunk))
		child.on('error', (error) => resolve({ code: -1, signal: null, stdout, stderr: stderr + String(error.message) }))
		child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
	})
}

/** Последние строки вывода для сообщений об ошибке */
function tail(text, lines = 15) {
	return String(text ?? '')
		.trimEnd()
		.split('\n')
		.slice(-lines)
		.join('\n')
}

/** Окружение для initdb/pg_ctl/createdb: без PG* и с LC_ALL (иначе postmaster падает на macOS) */
function pgToolEnv() {
	return { ...strippedEnv(process.env), LC_ALL: 'en_US.UTF-8' }
}

/** Жив ли процесс: мёртвым считается только ESRCH (EPERM — чужой, но живой процесс) */
function isPidAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error.code !== 'ESRCH'
	}
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

/** Подключение к базе на время fn; URL проходит защиту до подключения */
async function withClient(url, fn) {
	const client = new pg.Client({ connectionString: assertTestDatabaseUrl(url) })
	await client.connect()
	try {
		return await fn(client)
	} finally {
		await client.end()
	}
}

// ---------------------------------------------------------------------------
// Поиск PostgreSQL 17
// ---------------------------------------------------------------------------

function isExecutable(file) {
	try {
		fs.accessSync(file, fs.constants.X_OK)
		return fs.statSync(file).isFile()
	} catch {
		return false
	}
}

function isPostgres17Dir(dir) {
	if (!dir) return false
	for (const tool of ['initdb', 'pg_ctl', 'createdb']) {
		if (!isExecutable(path.join(dir, tool))) return false
	}
	try {
		const version = execFileSync(path.join(dir, 'initdb'), ['--version'], { encoding: 'utf8' })
		const match = /\(PostgreSQL\)\s+(\d+)/.exec(version)
		return match !== null && Number(match[1]) === 17
	} catch {
		return false
	}
}

/**
 * Каталог с initdb, pg_ctl и createdb PostgreSQL 17.
 * PG_BIN_DIR, если задан, — единственный кандидат (без PATH и фиксированных путей),
 * поэтому неверный PG_BIN_DIR воспроизводит отсутствие PostgreSQL даже там, где он установлен.
 */
export function findPgBin(env = process.env) {
	const exclusive = typeof env.PG_BIN_DIR === 'string' && env.PG_BIN_DIR !== ''
	const candidates = exclusive
		? [env.PG_BIN_DIR]
		: [
				...String(env.PATH ?? '')
					.split(path.delimiter)
					.filter(Boolean),
				...FIXED_PG_DIRS,
			]
	for (const dir of candidates) {
		if (isPostgres17Dir(dir)) return dir
	}
	let message =
		'PostgreSQL 17 not found: brew install postgresql@17, or set TEST_DATABASE_URL to a local test_* database'
	if (exclusive) message += ' (PG_BIN_DIR is set and is the only directory searched)'
	throw new Error(message)
}

// ---------------------------------------------------------------------------
// Кластер
// ---------------------------------------------------------------------------

/** PID из первой строки файла: null — файла нет, NaN — файл есть, но PID не читается */
async function readPidFile(file) {
	let text
	try {
		text = await fsp.readFile(file, 'utf8')
	} catch (error) {
		return error.code === 'ENOENT' ? null : Number.NaN
	}
	const pid = Number.parseInt(text.split('\n')[0].trim(), 10)
	return Number.isInteger(pid) && pid > 0 ? pid : Number.NaN
}

/** PID-файл защищает каталог, если он есть и его процесс жив или PID не читается */
function pidProtects(pid) {
	return pid !== null && (Number.isNaN(pid) || isPidAlive(pid))
}

/** Командная строка процесса по ps (null — процесса нет или ps не ответил) */
async function processCommand(pid) {
	const result = await run('ps', ['-ww', '-o', 'command=', '-p', String(pid)])
	if (result.code !== 0) return null
	const command = result.stdout.trim()
	return command === '' ? null : command
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Процесс pid — postmaster именно этого каталога данных: исполняемый файл postgres и аргумент
 * -D <dataDir> отдельным словом. PID из postmaster.pid после перезагрузки может принадлежать
 * чужому процессу, а pg_ctl stop ничего не проверяет и послал бы ему SIGQUIT; поэтому сигнал
 * уходит только процессу, чья командная строка совпала.
 */
async function isPostmasterOf(pid, dataDir) {
	const command = await processCommand(pid)
	if (command === null) return false
	const executable = command.split(/\s+/)[0]
	if (path.basename(executable) !== 'postgres') return false
	const dirs = new Set([dataDir])
	try {
		dirs.add(await fsp.realpath(dataDir))
	} catch {
		// каталога уже нет: сравниваем только исходный путь
	}
	return [...dirs].some((dir) => new RegExp(`\\s-D\\s+["']?${escapeRegExp(dir)}["']?(\\s|$)`).test(command))
}

/** Ждёт завершения процесса до timeoutMs; true — процесс завершился */
async function waitForExit(pid, timeoutMs) {
	const deadline = Date.now() + timeoutMs
	while (isPidAlive(pid)) {
		if (Date.now() >= deadline) return false
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	return true
}

/**
 * Останавливает postmaster брошенного кластера: владелец мёртв, а postmaster жив (pg_ctl start
 * запускает его в собственной сессии, и он переживает обёртку после SIGHUP, kill -9 или закрытого
 * терминала). Сигнал получает только проверенный PID; SIGQUIT — немедленная остановка, как
 * pg_ctl -m immediate. Возвращает true, если postmaster остановлен.
 */
async function stopOrphanPostmaster(dir, pid) {
	const dataDir = path.join(dir, 'data')
	if (!(await isPostmasterOf(pid, dataDir))) {
		console.error(`[test-db] orphan cluster ${dir}: pid ${pid} is not its postmaster, left untouched`)
		return false
	}
	try {
		process.kill(pid, 'SIGQUIT')
	} catch (error) {
		if (error.code !== 'ESRCH') {
			console.error(`[test-db] could not stop orphan postmaster ${pid}: ${error.message}`)
			return false
		}
	}
	if (await waitForExit(pid, 10_000)) {
		console.error(`[test-db] stopped orphan postmaster ${pid} (${dir})`)
		return true
	}
	console.error(`[test-db] orphan postmaster ${pid} did not exit, ${dir} left in place`)
	return false
}

/**
 * Удаляет брошенные кластеры bio-exam-pg-* (например, после kill -9, SIGHUP или закрытого терминала).
 * - Живой owner.pid защищает каталог всегда, в том числе до появления postmaster.pid (во время initdb).
 * - Если owner.pid указывает на мёртвый процесс, а postmaster из data/postmaster.pid жив и его
 *   командная строка — postgres с -D именно этого каталога, postmaster останавливается, затем
 *   каталог удаляется. Живой процесс с другой командной строкой (PID переиспользован) не трогается,
 *   и каталог остаётся.
 * - Каталог удаляется, только если все существующие PID-файлы указывают на мёртвые процессы.
 * - Каталог без обоих файлов удаляется, только если он старше 10 минут.
 */
export async function sweepOrphanClusters() {
	const root = os.tmpdir()
	let entries
	try {
		entries = await fsp.readdir(root, { withFileTypes: true })
	} catch {
		return []
	}
	const removed = []
	for (const entry of entries) {
		if (!entry.isDirectory() || !entry.name.startsWith(CLUSTER_PREFIX)) continue
		const dir = path.join(root, entry.name)
		const owner = await readPidFile(path.join(dir, 'owner.pid'))
		const postmasterFile = path.join(dir, 'data', 'postmaster.pid')
		let postmaster = await readPidFile(postmasterFile)
		const ownerDead = owner !== null && !Number.isNaN(owner) && !isPidAlive(owner)
		if (ownerDead && postmaster !== null && !Number.isNaN(postmaster) && isPidAlive(postmaster)) {
			if (!(await stopOrphanPostmaster(dir, postmaster))) continue
			postmaster = await readPidFile(postmasterFile)
		}
		if (pidProtects(owner) || pidProtects(postmaster)) continue
		if (owner === null && postmaster === null) {
			try {
				const { mtimeMs } = await fsp.stat(dir)
				if (Date.now() - mtimeMs < ORPHAN_MIN_AGE_MS) continue
			} catch {
				continue
			}
		}
		try {
			await fsp.rm(dir, { recursive: true, force: true })
			removed.push(dir)
			console.error(`[test-db] removed orphan cluster ${dir}`)
		} catch (error) {
			console.error(`[test-db] could not remove orphan cluster ${dir}: ${error.message}`)
		}
	}
	return removed
}

/**
 * Поднимает новый кластер PostgreSQL 17 во временном каталоге.
 * Структура: <dir>/owner.pid (PID создателя), <dir>/data (PGDATA), <dir>/postgres.log.
 * Возвращает { adminUrl, dir, stop }; stop() идемпотентен и удаляет каталог.
 */
export async function startTestCluster() {
	await sweepOrphanClusters()
	const bin = findPgBin()
	const env = pgToolEnv()
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), CLUSTER_PREFIX))
	// Маркер владельца пишется сразу: каталог защищён от чужой очистки ещё до initdb
	await fsp.writeFile(path.join(dir, 'owner.pid'), `${process.pid}\n`)
	const dataDir = path.join(dir, 'data')
	const logFile = path.join(dir, 'postgres.log')

	let stopPromise = null
	const stop = () => {
		stopPromise ??= (async () => {
			if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
				await run(path.join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'], { env })
			}
			await fsp.rm(dir, { recursive: true, force: true })
		})()
		return stopPromise
	}

	try {
		const init = await run(
			path.join(bin, 'initdb'),
			['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=en_US.UTF-8', '--no-sync'],
			{ env }
		)
		if (init.code !== 0) throw new Error(`initdb failed (exit ${init.code}):\n${tail(init.stderr)}`)

		let port = 0
		let started = false
		for (let attempt = 1; attempt <= 2 && !started; attempt++) {
			port = await getFreePort()
			const options = [
				`-p ${port}`,
				'-c listen_addresses=127.0.0.1',
				// пустой каталог сокета: только TCP, обход лимита 103 байта на путь сокета
				'-c unix_socket_directories=',
				'-c timezone=UTC',
				'-c fsync=off',
				'-c synchronous_commit=off',
				'-c full_page_writes=off',
			].join(' ')
			const start = await run(
				path.join(bin, 'pg_ctl'),
				['-D', dataDir, '-w', '-t', '30', '-l', logFile, '-o', options, 'start'],
				{ env }
			)
			started = start.code === 0
		}
		if (!started) {
			const log = fs.existsSync(logFile) ? await fsp.readFile(logFile, 'utf8') : ''
			throw new Error(`pg_ctl start failed twice:\n${tail(log)}`)
		}

		const created = await run(
			path.join(bin, 'createdb'),
			['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', ADMIN_DATABASE],
			{ env }
		)
		if (created.code !== 0) throw new Error(`createdb failed (exit ${created.code}):\n${tail(created.stderr)}`)

		console.error(`[test-db] cluster 127.0.0.1:${port} (${dir})`)
		return { adminUrl: `postgres://postgres@127.0.0.1:${port}/${ADMIN_DATABASE}`, dir, stop }
	} catch (error) {
		await stop()
		throw error
	}
}

/**
 * Сервер для тестов: TEST_DATABASE_URL (CI, после защиты) или свежий локальный кластер.
 * Пустой или некорректный TEST_DATABASE_URL отклоняется, DATABASE_URL не используется никогда.
 */
export async function acquireTestServer() {
	const preset = process.env.TEST_DATABASE_URL
	if (preset !== undefined) {
		return { adminUrl: assertTestDatabaseUrl(preset), dir: null, stop: async () => {} }
	}
	return startTestCluster()
}

/** Создаёт временную базу <prefix>_<pid>_<hex>; drop() удаляет её с FORCE */
export async function createScratchDatabase(adminUrl, prefix) {
	if (typeof prefix !== 'string' || !TEST_NAME.test(prefix)) {
		throw new Error(`scratch database prefix ${String(prefix)} must match ^test_[a-z0-9_]+$`)
	}
	const name = `${prefix}_${process.pid}_${crypto.randomBytes(3).toString('hex')}`.toLowerCase()
	const url = withDatabaseName(adminUrl, name)
	await withClient(adminUrl, (client) => client.query(`CREATE DATABASE "${name}"`))
	let dropPromise = null
	const drop = () => {
		dropPromise ??= withClient(adminUrl, (client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
		return dropPromise
	}
	return { url, name, drop }
}

/**
 * Проверка настроек базы: UTF8, не C/POSIX локаль (иначе кириллический pg_trgm молча
 * даёт similarity 0), часовой пояс UTC.
 */
export async function assertDatabaseSettings(url) {
	const { rows } = await withClient(url, (client) =>
		client.query(
			`SELECT pg_encoding_to_char(encoding) AS encoding, datcollate, datctype,
				current_setting('TimeZone') AS timezone
			FROM pg_database WHERE datname = current_database()`
		)
	)
	const settings = rows[0]
	if (!settings) throw new Error('database settings: current database not found in pg_database')
	const problems = []
	if (settings.encoding !== 'UTF8') problems.push(`encoding ${settings.encoding} is not UTF8`)
	for (const key of ['datcollate', 'datctype']) {
		if (['C', 'POSIX'].includes(settings[key])) problems.push(`${key} ${settings[key]} breaks Cyrillic trigram search`)
	}
	if (!['UTC', 'Etc/UTC'].includes(settings.timezone)) problems.push(`timezone ${settings.timezone} is not UTC`)
	if (problems.length > 0) throw new Error(`database settings: ${problems.join('; ')}`)
	return settings
}

/** Окружение изолированного дочернего процесса: без DATABASE_URL, SUPABASE_*, PG*; флаг изоляции */
export function isolatedChildEnv(extra = {}) {
	const env = strippedEnv(process.env)
	env[ISOLATED_ENV_FLAG] = '1'
	return { ...env, ...extra }
}

/** Сигналы, по которым withTestDatabase удаляет базу и кластер, и коды выхода (128 + номер) */
const SIGNAL_EXIT_CODES = [
	['SIGINT', 130],
	['SIGTERM', 143],
	// Закрытый терминал: без обработчика обёртка умирает, а postmaster в своей сессии остаётся
	['SIGHUP', 129],
]

/** Ошибки записи в stdout/stderr (EIO после закрытия терминала) больше не роняют процесс */
function ignoreStreamErrors() {
	for (const stream of [process.stdout, process.stderr]) {
		if (!stream.listeners('error').includes(swallowStreamError)) stream.on('error', swallowStreamError)
	}
}

function swallowStreamError() {}

/**
 * Поднимает сервер, создаёт временную базу, проверяет настройки и вызывает fn({ url, name, dir }).
 * База и кластер удаляются всегда: в finally и по SIGINT/SIGTERM/SIGHUP (выход 130/143/129).
 * Очистка выполняется один раз; обработчики сигналов снимаются после обычного завершения.
 * Если обёртка всё же умерла без очистки (kill -9), кластер подберёт sweepOrphanClusters при
 * следующем запуске.
 */
export async function withTestDatabase(prefix, fn) {
	let serverPromise = null
	let scratchPromise = null
	let cleanupPromise = null
	const cleanup = () => {
		cleanupPromise ??= (async () => {
			// Ждём и незавершённый запуск: кластер, поднимающийся в момент сигнала, тоже удаляется
			const scratch = scratchPromise ? await scratchPromise.catch(() => null) : null
			if (scratch) await scratch.drop().catch((error) => console.error(`[test-db] drop failed: ${error.message}`))
			const server = serverPromise ? await serverPromise.catch(() => null) : null
			if (server) await server.stop().catch((error) => console.error(`[test-db] stop failed: ${error.message}`))
		})()
		return cleanupPromise
	}
	const onSignal = (signal, code) => () => {
		// Закрытый терминал (SIGHUP): запись в консоль может упасть с EIO синхронно или событием
		// 'error' потока. Ни то, ни другое не должно прервать очистку кластера
		ignoreStreamErrors()
		try {
			console.error(`[test-db] ${signal}: cleaning up`)
		} catch {
			// консоль недоступна
		}
		cleanup().finally(() => process.exit(code))
	}
	const handlers = SIGNAL_EXIT_CODES.map(([signal, code]) => [signal, onSignal(signal, code)])
	for (const [signal, handler] of handlers) process.on(signal, handler)
	try {
		serverPromise = acquireTestServer()
		const server = await serverPromise
		scratchPromise = createScratchDatabase(server.adminUrl, prefix)
		const scratch = await scratchPromise
		await assertDatabaseSettings(scratch.url)
		return await fn({ url: scratch.url, name: scratch.name, dir: server.dir })
	} finally {
		await cleanup()
		for (const [signal, handler] of handlers) process.off(signal, handler)
	}
}

// ---------------------------------------------------------------------------
// Самопроверка
// ---------------------------------------------------------------------------

async function selfTest() {
	const failures = []
	const check = async (name, fn) => {
		try {
			await fn()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures.push(name)
			console.log(`not ok - ${name}: ${error && error.message ? error.message : String(error)}`)
		}
	}
	const expect = (condition, message) => {
		if (!condition) throw new Error(message)
	}

	const journalPath = path.join(REPO_ROOT, 'app/server/drizzle/meta/_journal.json')
	const journal = JSON.parse(await fsp.readFile(journalPath, 'utf8'))
	const expectedMigrations = journal.entries.length
	const wrapperPath = path.join(REPO_ROOT, 'scripts/with-test-db.mjs')
	const serverWorkspace = ['workspace', '@bio-exam/server']
	const remoteHost = 'postgres://u@db.example.invalid:5432/test_x'

	// Таблица защиты: вызовы в процессе, без базы
	await check('guard table', async () => {
		const accepted = ['postgres://postgres@127.0.0.1:5432/test_x', 'postgresql://u:p@localhost/test_bio_exam']
		for (const value of accepted) assertTestDatabaseUrl(value)
		const rejected = [
			[undefined, 'is not set'],
			['', 'is not set'],
			['not a url', 'is not a valid URL'],
			['mysql://localhost/test_x', 'protocol'],
			['postgres://u@db.example.invalid:5432/test_x', 'host db.example.invalid is not localhost or 127.0.0.1'],
			['postgres://u@127.0.0.2:5432/test_x', 'host 127.0.0.2 is not localhost or 127.0.0.1'],
			['postgres://u@127.0.0.1:5432/postgres', 'database postgres does not match ^test_[a-z0-9_]+$'],
			['postgres://u@127.0.0.1:5432/prod', 'database prod does not match ^test_[a-z0-9_]+$'],
			['postgres://u@127.0.0.1:5432/Test_x', 'database Test_x does not match ^test_[a-z0-9_]+$'],
			['postgres://u@127.0.0.1:5432/test_x?host=db.example.invalid', 'must not contain a query string'],
			['postgres://u@127.0.0.1:5432/test_x?hostaddr=192.0.2.1', 'must not contain a query string'],
		]
		for (const [value, fragment] of rejected) {
			let message = null
			try {
				assertTestDatabaseUrl(value)
			} catch (error) {
				message = error.message
			}
			expect(message !== null, `guard accepted case ${JSON.stringify(value)}`)
			expect(message.includes(fragment), `guard message for ${JSON.stringify(value)} lacks "${fragment}"`)
		}
		// DATABASE_URL никогда не подставляется вместо отсутствующего TEST_DATABASE_URL
		let fallback = null
		try {
			resolveIsolatedDatabaseUrl({ DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/test_x' })
		} catch (error) {
			fallback = error.message
		}
		expect(fallback === 'TEST_DATABASE_URL is not set', 'resolveIsolatedDatabaseUrl fell back to DATABASE_URL')
	})

	await check('harness database', async () => {
		await withTestDatabase('test_selftest', async ({ url, name }) => {
			console.error(`[test-db] scratch database ${name}`)

			await check(`migrations applied through the real runner (${expectedMigrations})`, async () => {
				const result = await run('yarn', [...serverWorkspace, 'drizzle:migrate'], {
					cwd: REPO_ROOT,
					env: isolatedChildEnv({ TEST_DATABASE_URL: url }),
				})
				expect(result.code === 0, `drizzle:migrate exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
				const { rows } = await withClient(url, (client) =>
					client.query('SELECT count(*)::int AS n FROM public.__drizzle_migrations')
				)
				expect(rows[0].n === expectedMigrations, `__drizzle_migrations has ${rows[0].n}, journal ${expectedMigrations}`)
				expect(name.startsWith('test_selftest_'), `unexpected scratch name ${name}`)
			})

			await check('isolated probe ignores .env and Supabase vars', async () => {
				// SUPABASE_* в родителе: изолированное окружение обязано их убрать
				const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY }
				process.env.SUPABASE_URL = 'https://poison.invalid'
				process.env.SUPABASE_SERVICE_KEY = 'poison'
				let env
				try {
					env = isolatedChildEnv({
						TEST_DATABASE_URL: url,
						DATABASE_URL: 'postgres://poison@poison.invalid:5432/test_poison',
					})
				} finally {
					if (saved.url === undefined) delete process.env.SUPABASE_URL
					else process.env.SUPABASE_URL = saved.url
					if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_KEY
					else process.env.SUPABASE_SERVICE_KEY = saved.key
				}
				const result = await run('yarn', [...serverWorkspace, 'tsx', 'src/scripts/isolation-probe.ts'], {
					cwd: REPO_ROOT,
					env,
				})
				expect(result.code === 0, `probe exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
				const line = result.stdout
					.trim()
					.split('\n')
					.find((l) => l.startsWith('{'))
				expect(line !== undefined, 'probe printed no JSON line')
				const report = JSON.parse(line)
				expect(report.envLoadedFrom === null, `envLoadedFrom is ${report.envLoadedFrom}`)
				expect(report.supabaseUrlSet === false, 'SUPABASE_URL reached the isolated child')
				expect(report.supabaseKeySet === false, 'SUPABASE_SERVICE_KEY reached the isolated child')
				expect(report.database === name, `probe connected to ${report.database}, expected ${name}`)
			})

			await check('isolated probe rejects remote host', async () => {
				const result = await run('yarn', [...serverWorkspace, 'tsx', 'src/scripts/isolation-probe.ts'], {
					cwd: REPO_ROOT,
					env: isolatedChildEnv({ TEST_DATABASE_URL: remoteHost }),
				})
				const output = result.stdout + result.stderr
				expect(result.code !== 0, 'probe exited 0 with a remote host')
				expect(output.includes('TEST_DATABASE_URL host db.example.invalid'), `guard message absent:\n${tail(output)}`)
			})

			await check('isolated migration runner rejects database prod', async () => {
				const prod = new URL(url)
				prod.pathname = '/prod'
				const result = await run('yarn', [...serverWorkspace, 'drizzle:migrate'], {
					cwd: REPO_ROOT,
					env: isolatedChildEnv({ TEST_DATABASE_URL: prod.toString() }),
				})
				const output = result.stdout + result.stderr
				expect(result.code !== 0, 'migration runner exited 0 for database prod')
				expect(
					output.includes('TEST_DATABASE_URL database prod does not match'),
					`guard message absent:\n${tail(output)}`
				)
			})
		})
	})

	// drizzle.config.ts: защита в изолированном режиме, загрузка без подключения
	const configProbe =
		"import('./drizzle.config.ts').then(() => process.exit(0), (e) => { console.error(String(e && e.message)); process.exit(3) })"
	await check('drizzle config rejects remote host', async () => {
		const result = await run('yarn', [...serverWorkspace, 'tsx', '-e', configProbe], {
			cwd: REPO_ROOT,
			env: isolatedChildEnv({ TEST_DATABASE_URL: remoteHost }),
		})
		const output = result.stdout + result.stderr
		expect(result.code === 3, `config probe exited ${result.code}, expected 3`)
		expect(output.includes('TEST_DATABASE_URL host db.example.invalid'), `guard message absent:\n${tail(output)}`)
	})
	await check('drizzle config loads with a local test database', async () => {
		const result = await run('yarn', [...serverWorkspace, 'tsx', '-e', configProbe], {
			cwd: REPO_ROOT,
			env: isolatedChildEnv({ TEST_DATABASE_URL: 'postgres://u@127.0.0.1:5432/test_x' }),
		})
		expect(result.code === 0, `config probe exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
	})

	// Обёртка with-test-db.mjs
	const spawnWrapper = (args, env = process.env) =>
		new Promise((resolve) => {
			const child = spawn(process.execPath, [wrapperPath, ...args], {
				cwd: REPO_ROOT,
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			const result = { child, stdout: '', stderr: '', dir: null, code: null, signal: null }
			let onReady = null
			result.ready = new Promise((r) => (onReady = r))
			child.stdout.on('data', (chunk) => (result.stdout += chunk))
			child.stderr.on('data', (chunk) => {
				result.stderr += chunk
				const match = /\[with-test-db\] ready (\S+)/.exec(result.stderr)
				if (match && result.dir === null) {
					result.dir = match[1]
					onReady()
				}
			})
			result.done = new Promise((r) =>
				child.on('close', (code, signal) => {
					result.code = code
					result.signal = signal
					onReady()
					r(result)
				})
			)
			resolve(result)
		})
	const clusterDirGone = (dir) => dir === 'preset' || !fs.existsSync(dir)

	await check('exit code passthrough with teardown', async () => {
		const wrapper = await spawnWrapper(['--', process.execPath, '-e', 'process.exit(3)'])
		await wrapper.done
		expect(wrapper.code === 3, `wrapper exited ${wrapper.code}, expected 3:\n${tail(wrapper.stderr)}`)
		expect(wrapper.dir !== null, 'ready marker absent')
		expect(clusterDirGone(wrapper.dir), `cluster directory ${wrapper.dir} still exists`)
	})

	await check('sigint teardown', async () => {
		const wrapper = await spawnWrapper([process.execPath, '-e', 'setTimeout(() => {}, 60000)'])
		const timer = setTimeout(() => wrapper.child.kill('SIGKILL'), 60000)
		await wrapper.ready
		expect(wrapper.dir !== null, `ready marker absent:\n${tail(wrapper.stderr)}`)
		wrapper.child.kill('SIGINT')
		await wrapper.done
		clearTimeout(timer)
		expect(wrapper.code !== 0, `wrapper exited ${wrapper.code} after SIGINT`)
		expect(clusterDirGone(wrapper.dir), `cluster directory ${wrapper.dir} still exists`)
	})

	await check('parallel runs', async () => {
		const report =
			"const u = new URL(process.env.TEST_DATABASE_URL); process.stdout.write('db ' + u.pathname.slice(1) + ' ' + u.port + '\\n')"
		const [a, b] = await Promise.all([
			spawnWrapper(['--prefix', 'test_parallel', '--', process.execPath, '-e', report]),
			spawnWrapper(['--prefix', 'test_parallel', '--', process.execPath, '-e', report]),
		])
		await Promise.all([a.done, b.done])
		expect(a.code === 0 && b.code === 0, `exit codes ${a.code} and ${b.code}:\n${tail(a.stderr + b.stderr)}`)
		const parse = (w) => /db (\S+) (\d+)/.exec(w.stdout)
		const [pa, pb] = [parse(a), parse(b)]
		expect(pa && pb, 'children did not report their database')
		expect(pa[1] !== pb[1], 'both runs got the same scratch database name')
		if (a.dir !== 'preset') {
			expect(a.dir !== b.dir, 'both runs got the same cluster directory')
			expect(pa[2] !== pb[2], 'both runs got the same port')
		}
		expect(clusterDirGone(a.dir) && clusterDirGone(b.dir), 'a cluster directory survived')
	})

	await check('orphan sweep', async () => {
		const deadPid = await findDeadPid()
		const makeFake = async ({ owner, postmaster, ageMinutes }) => {
			const dir = await fsp.mkdtemp(path.join(os.tmpdir(), CLUSTER_PREFIX))
			if (owner !== undefined) await fsp.writeFile(path.join(dir, 'owner.pid'), `${owner}\n`)
			if (postmaster !== undefined) {
				await fsp.mkdir(path.join(dir, 'data'))
				await fsp.writeFile(path.join(dir, 'data', 'postmaster.pid'), `${postmaster}\n/fake\n`)
			}
			if (ageMinutes !== undefined) {
				const past = new Date(Date.now() - ageMinutes * 60_000)
				await fsp.utimes(dir, past, past)
			}
			return dir
		}
		const postmasterPid = async (cluster) => readPidFile(path.join(cluster.dir, 'data', 'postmaster.pid'))

		// Настоящие кластеры поднимаются до подмены owner.pid: startTestCluster сам вызывает очистку
		const orphan = await startTestCluster()
		const live = await startTestCluster().catch(async (error) => {
			await orphan.stop()
			throw error
		})
		// Живой процесс, который не postgres: его PID в postmaster.pid (переиспользованный PID)
		const sleeper = spawn('sleep', ['600'], { stdio: 'ignore' })
		const fakes = []
		try {
			const orphanPid = await postmasterPid(orphan)
			const livePid = await postmasterPid(live)
			expect(isPidAlive(orphanPid) && isPidAlive(livePid), 'test clusters are not running')
			expect(isPidAlive(sleeper.pid), 'sleep did not start')

			// Владелец кластера умер (SIGHUP, kill -9), postmaster работает дальше
			await fsp.writeFile(path.join(orphan.dir, 'owner.pid'), `${deadPid}\n`)
			const foreignSleep = await makeFake({ owner: deadPid, postmaster: sleeper.pid })
			// postgres, но другого каталога: -D не совпадает, сигнал запрещён
			const foreignPostgres = await makeFake({ owner: deadPid, postmaster: livePid })
			const staleFiles = await makeFake({ owner: deadPid, postmaster: deadPid })
			const liveOwner = await makeFake({ owner: process.pid })
			const staleBare = await makeFake({ ageMinutes: 20 })
			const freshBare = await makeFake({})
			fakes.push(foreignSleep, foreignPostgres, staleFiles, liveOwner, staleBare, freshBare)

			const removed = await sweepOrphanClusters()

			expect(!isPidAlive(orphanPid), `orphan postmaster ${orphanPid} still runs after the sweep`)
			expect(!fs.existsSync(orphan.dir), 'orphan cluster directory was not removed')
			expect(removed.includes(orphan.dir), 'sweep did not report the orphan cluster')
			expect(isPidAlive(sleeper.pid), 'a non-postgres process from postmaster.pid was signalled')
			expect(fs.existsSync(foreignSleep), 'directory with a live non-postgres pid was removed')
			expect(isPidAlive(livePid), 'a postgres of another data directory was signalled')
			expect(fs.existsSync(foreignPostgres), 'directory pointing at a foreign postgres was removed')
			expect(fs.existsSync(live.dir), 'cluster with a live owner was removed')
			expect(!fs.existsSync(staleFiles), 'directory with dead owner and dead postmaster was not removed')
			expect(fs.existsSync(liveOwner), 'live-owner directory without postmaster.pid was removed')
			expect(!fs.existsSync(staleBare), 'stale directory without pid files was not removed')
			expect(fs.existsSync(freshBare), 'fresh directory without pid files was removed')
		} finally {
			sleeper.kill('SIGKILL')
			// stop() идемпотентен: остановит postmaster, если очистка его не тронула, и удалит каталог
			await orphan.stop()
			await live.stop()
			for (const dir of fakes) await fsp.rm(dir, { recursive: true, force: true })
		}
	})

	await check('missing postgres fails with install hint', async () => {
		let message = null
		try {
			findPgBin({ PG_BIN_DIR: '/nonexistent', PATH: process.env.PATH })
		} catch (error) {
			message = error.message
		}
		expect(message !== null, 'findPgBin accepted PG_BIN_DIR=/nonexistent')
		expect(message.includes('PostgreSQL 17 not found') && message.includes('PG_BIN_DIR'), `message: ${message}`)
		// На этой машине PostgreSQL 17 есть в PATH: значит, отказ выше вызван только исключительным PG_BIN_DIR
		findPgBin({ PATH: process.env.PATH })

		const before = await listClusterDirs()
		const env = { ...process.env, PG_BIN_DIR: '/nonexistent' }
		delete env.TEST_DATABASE_URL
		const wrapper = await spawnWrapper(['--', process.execPath, '-e', 'process.exit(0)'], env)
		await wrapper.done
		expect(wrapper.code !== 0, 'wrapper exited 0 without PostgreSQL')
		expect(wrapper.stderr.includes('PostgreSQL 17 not found'), `install hint absent:\n${tail(wrapper.stderr)}`)
		expect(!wrapper.stderr.includes('[with-test-db] ready'), 'ready marker printed although the child must not run')
		const after = await listClusterDirs()
		expect(
			after.every((dir) => before.includes(dir)),
			'a bio-exam-pg-* directory was left behind'
		)
	})

	await check('empty TEST_DATABASE_URL is rejected by the wrapper', async () => {
		const wrapper = await spawnWrapper(['--', process.execPath, '-e', 'process.exit(0)'], {
			...process.env,
			TEST_DATABASE_URL: '',
		})
		await wrapper.done
		expect(wrapper.code !== 0, 'wrapper exited 0 with an empty TEST_DATABASE_URL')
		expect(wrapper.stderr.includes('TEST_DATABASE_URL is not set'), `guard message absent:\n${tail(wrapper.stderr)}`)
		expect(!wrapper.stderr.includes('[with-test-db] ready'), 'ready marker printed')
	})

	if (failures.length > 0) {
		console.log(`test-db self-test: FAILED (${failures.length}: ${failures.join(', ')})`)
		return 1
	}
	console.log('test-db self-test: OK')
	return 0
}

/** PID процесса, который точно завершился */
async function findDeadPid() {
	for (let attempt = 0; attempt < 5; attempt++) {
		const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
		await new Promise((resolve) => child.on('close', resolve))
		if (!isPidAlive(child.pid)) return child.pid
	}
	throw new Error('could not find a dead PID')
}

/** Каталоги bio-exam-pg-* во временной папке */
async function listClusterDirs() {
	const entries = await fsp.readdir(os.tmpdir())
	return entries.filter((entry) => entry.startsWith(CLUSTER_PREFIX)).map((entry) => path.join(os.tmpdir(), entry))
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	if (process.argv.includes('--self-test')) {
		selfTest().then(
			(code) => process.exit(code),
			(error) => {
				console.error(`test-db self-test crashed: ${error && error.message ? error.message : String(error)}`)
				process.exit(1)
			}
		)
	} else {
		console.error('usage: node scripts/lib/test-db.mjs --self-test')
		process.exit(2)
	}
}
