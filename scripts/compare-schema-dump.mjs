/**
 * Сравнение схемы боевой базы (Supabase) с цепочкой миграций 0000-0020 (D-07), один раз и только на чтение.
 *
 * Роли:
 *  - Пользователь сам снимает `pg_dump --schema-only` и метаданные боевой базы (план 01-12, задача 2) и кладёт
 *    их под .planning/ (каталог в .gitignore). Этот скрипт никогда не подключается к боевой базе: у него нет
 *    ни её адреса, ни пароля, он читает только готовые файлы.
 *  - Скрипт поднимает временный кластер (harness 01-01), прогоняет настоящий раннер миграций в базе test_d07*,
 *    снимает такой же дамп (pg_dump 17) и сравнивает нормализованные тексты через `diff -u`.
 *
 * Использование:
 *   node scripts/compare-schema-dump.mjs --prod <дамп.sql> [--prod-meta <метаданные.txt>] --report <отчёт.md>
 *   node scripts/compare-schema-dump.mjs --self-test
 *
 * Нормализация (normalize): выбрасываются строки-комментарии `--`, пустые строки, строки `\restrict <токен>`
 * и `\unrestrict <токен>` (pg_dump 17.10 пишет случайный токен: два дампа одной схемы отличаются только им,
 * Pitfall 13) и начало сессии (`SET ...;`, `SELECT pg_catalog.set_config(...)`). Хвостовые пробелы срезаются.
 *
 * Отличия делятся на группы подряд идущих строк +/- внутри ханков diff. Группа — `шум платформы`, только если
 * каждая её строка совпала с шаблоном платформы Supabase (публикация supabase_realtime, права по умолчанию,
 * GRANT/REVOKE, служебные схемы, расширения платформы, комментарий схемы public). Всё остальное — `реальное
 * отличие`: неопознанное по умолчанию считается реальным.
 *
 * Файл метаданных (порядок команд фиксирован): строка 1 — `show timezone`, строка 2 — `datcollate datctype`,
 * далее строки `<hash> <created_at>` из public.__drizzle_migrations. В колонке hash бывает либо sha256 (штатный
 * мигратор drizzle), либо имя миграции (старый самописный раннер до f9d0e45): оба вида учитываются.
 *
 * Код выхода: 0 — сравнение выполнено (отличия — это находка, а не ошибка) или самопроверка пройдена;
 * 1 — ошибка; 2 — неверные аргументы. Адрес временной базы не печатается. Нет зависимостей, только локально.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	acquireTestServer,
	assertDatabaseSettings,
	createScratchDatabase,
	findPgBin,
	isolatedChildEnv,
} from './lib/test-db.mjs'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const MIGRATIONS_PATH = path.join(REPO_ROOT, 'app/server/drizzle')
const SERVER_WORKSPACE = ['workspace', '@bio-exam/server']
const TMP_PREFIX = 'bio-exam-schema-diff-'
const PG_DUMP_FLAGS = ['--schema-only', '--schema=public', '--schema=extensions', '--no-owner', '--no-privileges']
const LABEL_NOISE = 'шум платформы'
const LABEL_REAL = 'реальное отличие'
const USAGE =
	'usage: node scripts/compare-schema-dump.mjs --prod <dump.sql> [--prod-meta <meta.txt>] --report <report.md>\n' +
	'       node scripts/compare-schema-dump.mjs --self-test'

// Временные каталоги: удаляются в finally и по сигналу
const activeTmpDirs = new Set()

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
		child.on('error', (error) => resolve({ code: -1, stdout, stderr: stderr + String(error.message) }))
		child.on('close', (code) => resolve({ code, stdout, stderr }))
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

async function makeTmpDir() {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
	activeTmpDirs.add(dir)
	return dir
}

async function removeTmpDir(dir) {
	await fsp.rm(dir, { recursive: true, force: true })
	activeTmpDirs.delete(dir)
}

// ---------------------------------------------------------------------------
// Дамп цепочки миграций
// ---------------------------------------------------------------------------

/** Настоящий раннер миграций против временной базы (как в check-migrations.mjs) */
async function runMigrator(url) {
	const result = await run('yarn', [...SERVER_WORKSPACE, 'drizzle:migrate'], {
		cwd: REPO_ROOT,
		env: isolatedChildEnv({ TEST_DATABASE_URL: url }),
	})
	if (result.code !== 0) {
		throw new Error(`drizzle:migrate exited ${result.code}:\n${tail(result.stdout + result.stderr)}`)
	}
}

/** Версия клиента pg_dump (PostgreSQL 17 из findPgBin) */
async function pgDumpVersion() {
	const result = await run(path.join(findPgBin(), 'pg_dump'), ['--version'], { env: isolatedChildEnv() })
	if (result.code !== 0) throw new Error(`pg_dump --version exited ${result.code}:\n${tail(result.stderr)}`)
	return result.stdout.trim()
}

/** pg_dump временной базы; адрес базы передаётся только через --dbname и нигде не печатается */
async function pgDump(url) {
	const result = await run(path.join(findPgBin(), 'pg_dump'), [...PG_DUMP_FLAGS, `--dbname=${url}`], {
		env: isolatedChildEnv(),
	})
	if (result.code !== 0) throw new Error(`pg_dump exited ${result.code}:\n${tail(result.stderr)}`)
	return result.stdout
}

/**
 * Кластер, временные базы test_<prefix>_* и их очистка (в finally и по SIGINT/SIGTERM, выход 130/143).
 * fn получает [{ url, name }] в порядке prefixes. Очищается один раз; базы, каталоги и кластер удаляются всегда.
 */
async function withScratchDatabases(prefixes, fn) {
	let serverPromise = null
	const scratchPromises = []
	let cleanupPromise = null
	const cleanup = () => {
		cleanupPromise ??= (async () => {
			// Ждём и незавершённое создание: база или кластер, появившиеся в момент сигнала, тоже удаляются
			for (const promise of scratchPromises) {
				const scratch = await promise.catch(() => null)
				if (scratch)
					await scratch.drop().catch((error) => console.error(`[compare-schema-dump] drop failed: ${error.message}`))
			}
			for (const dir of [...activeTmpDirs]) await removeTmpDir(dir)
			const server = serverPromise ? await serverPromise.catch(() => null) : null
			if (server)
				await server.stop().catch((error) => console.error(`[compare-schema-dump] stop failed: ${error.message}`))
		})()
		return cleanupPromise
	}
	const onSignal = (signal, code) => () => {
		console.error(`[compare-schema-dump] ${signal}: cleaning up`)
		cleanup().finally(() => process.exit(code))
	}
	const onSigint = onSignal('SIGINT', 130)
	const onSigterm = onSignal('SIGTERM', 143)
	process.on('SIGINT', onSigint)
	process.on('SIGTERM', onSigterm)
	try {
		serverPromise = acquireTestServer()
		const server = await serverPromise
		const databases = []
		for (const prefix of prefixes) {
			const scratchPromise = createScratchDatabase(server.adminUrl, prefix)
			scratchPromises.push(scratchPromise)
			const scratch = await scratchPromise
			await assertDatabaseSettings(scratch.url)
			console.error(`[compare-schema-dump] scratch database ${scratch.name}`)
			databases.push({ url: scratch.url, name: scratch.name })
		}
		return await fn(databases)
	} finally {
		await cleanup()
		process.off('SIGINT', onSigint)
		process.off('SIGTERM', onSigterm)
	}
}

/** Мигрирует базу настоящим раннером и снимает сырой дамп */
async function migrateAndDump({ url }) {
	await runMigrator(url)
	return pgDump(url)
}

// ---------------------------------------------------------------------------
// Нормализация и diff
// ---------------------------------------------------------------------------

/** Строки дампа без комментариев, пустых строк, токенов \restrict / \unrestrict и начала сессии */
export function normalize(text) {
	return String(text)
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => {
			if (line === '') return false
			if (line.startsWith('--')) return false
			if (line.startsWith('\\restrict ') || line.startsWith('\\unrestrict ')) return false
			if (/^SET\s/.test(line)) return false
			if (line.startsWith('SELECT pg_catalog.set_config(')) return false
			return true
		})
		.join('\n')
}

/** Шаблоны платформы Supabase: строка группы либо совпадает с одним из них, либо группа — реальное отличие */
const NOISE_PATTERNS = [
	[/^(CREATE|ALTER|DROP)\s+PUBLICATION\s+supabase_realtime\b/, 'публикация supabase_realtime'],
	[/^ALTER\s+DEFAULT\s+PRIVILEGES\b/, 'права по умолчанию'],
	[/^(GRANT|REVOKE)\s/, 'права доступа (GRANT/REVOKE)'],
	[/^COMMENT\s+ON\s+SCHEMA\s+public\b/, 'комментарий схемы public'],
	[
		/^(CREATE\s+EXTENSION|COMMENT\s+ON\s+EXTENSION)\b.*\b(pg_stat_statements|pgcrypto|uuid-ossp|pg_graphql|supabase_vault|pgsodium|plpgsql)\b/,
		'расширение платформы',
	],
	[
		/^CREATE\s+SCHEMA\s+(auth|storage|realtime|_realtime|vault|graphql|graphql_public|supabase_functions|pgsodium|pgsodium_masks)\b/,
		'служебная схема Supabase',
	],
]

/** Класс одной группы изменённых строк (без префиксов +/-) */
export function classifyLines(lines) {
	const reasons = new Set()
	for (const raw of lines) {
		const line = raw.trim()
		const hit = NOISE_PATTERNS.find(([pattern]) => pattern.test(line))
		if (!hit) return { label: LABEL_REAL, reason: 'строка не совпала ни с одним шаблоном платформы' }
		reasons.add(hit[1])
	}
	return { label: LABEL_NOISE, reason: [...reasons].join(', ') }
}

/** Разбор `diff -u` на группы подряд идущих строк +/-: { hunk, range, removed, added } */
export function parseDiffGroups(diffText) {
	const groups = []
	let hunk = 0
	let range = ''
	let current = null
	for (const line of diffText.split('\n')) {
		const header = /^@@ (.+?) @@/.exec(line)
		if (header) {
			hunk += 1
			range = header[1]
			current = null
			continue
		}
		if (hunk === 0) continue
		if (line.startsWith('-') || line.startsWith('+')) {
			if (current === null) {
				current = { hunk, range, removed: [], added: [] }
				groups.push(current)
			}
			if (line.startsWith('-')) current.removed.push(line.slice(1))
			else current.added.push(line.slice(1))
		} else {
			current = null
		}
	}
	return groups.map((group) => ({ ...group, ...classifyLines([...group.removed, ...group.added]) }))
}

/** Сравнивает два сырых дампа: нормализация, diff -u, группы с классами. prod — слева, chain — справа */
export async function compareDumps(prodRaw, chainRaw) {
	const prod = normalize(prodRaw)
	const chain = normalize(chainRaw)
	const dir = await makeTmpDir()
	try {
		await fsp.writeFile(path.join(dir, 'prod.sql'), `${prod}\n`)
		await fsp.writeFile(path.join(dir, 'chain.sql'), `${chain}\n`)
		// -L прячет временные пути и время из заголовков diff; код 1 — есть отличия, это не ошибка
		const result = await run('diff', ['-u', '-L', 'prod.sql', '-L', 'chain.sql', 'prod.sql', 'chain.sql'], {
			cwd: dir,
		})
		if (result.code !== 0 && result.code !== 1) {
			throw new Error(`diff exited ${result.code}:\n${tail(result.stderr)}`)
		}
		const diffText = result.code === 0 ? '' : result.stdout.replace(/\n$/, '')
		return {
			prodLines: prod === '' ? 0 : prod.split('\n').length,
			chainLines: chain === '' ? 0 : chain.split('\n').length,
			diffText,
			groups: result.code === 0 ? [] : parseDiffGroups(diffText),
		}
	} finally {
		await removeTmpDir(dir)
	}
}

// ---------------------------------------------------------------------------
// Метаданные боевой базы
// ---------------------------------------------------------------------------

/** Разбор файла метаданных: часовой пояс, коллация и строки __drizzle_migrations (sha256 или имя миграции) */
export function parseProdMeta(text) {
	const lines = String(text)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '')
	const [timezone = null, collation = null, ...rest] = lines
	const migrations = []
	const unparsed = []
	for (const line of rest) {
		const row = /^(\S+)\s+(\d+)$/.exec(line)
		if (row) {
			const kind = /^[0-9a-f]{64}$/.test(row[1]) ? 'sha256' : 'tag'
			migrations.push({ hash: row[1], createdAt: row[2], kind })
		} else {
			unparsed.push(line)
		}
	}
	return { timezone, collation, migrations, unparsed }
}

/**
 * Сверка живой истории с манифестом. Запись совпадает с миграцией по sha256 (контрольная сумма проверена) или по имени
 * (в колонке hash лежит имя миграции, контрольная сумма НЕ проверена). created_at сверяется с when журнала только
 * у записей с sha256: у миграций 0000-0013 when в журнале синтетический (1700000000000 + n*1000).
 */
export function compareHistory(liveRows, manifest, journal) {
	const entries = manifest.migrations
	const bySha = new Map(entries.map((entry) => [entry.sha256, entry]))
	const byTag = new Map(entries.map((entry) => [entry.tag, entry]))
	const seen = new Map()
	const duplicates = []
	const extraLive = []
	const matchedByHash = []
	const matchedByTag = []
	const whenMismatch = []
	for (const row of liveRows) {
		if (seen.has(row.hash)) duplicates.push(row.hash)
		seen.set(row.hash, row)
		const shaEntry = bySha.get(row.hash)
		const tagEntry = shaEntry === undefined ? byTag.get(row.hash) : undefined
		if (shaEntry !== undefined) {
			matchedByHash.push(shaEntry.tag)
			const when = journal.entries[shaEntry.idx ?? entries.indexOf(shaEntry)]?.when
			if (when !== undefined && String(when) !== row.createdAt) whenMismatch.push(shaEntry.tag)
		} else if (tagEntry !== undefined) {
			matchedByTag.push(tagEntry.tag)
		} else {
			extraLive.push(row.hash)
		}
	}
	const covered = new Set([...matchedByHash, ...matchedByTag])
	const missingLive = entries.filter((entry) => !covered.has(entry.tag)).map((entry) => entry.tag)
	return {
		liveCount: liveRows.length,
		manifestCount: entries.length,
		matchedByHash,
		matchedByTag,
		missingLive,
		extraLive,
		duplicates,
		whenMismatch,
		equal: missingLive.length === 0 && extraLive.length === 0 && duplicates.length === 0 && matchedByTag.length === 0,
	}
}

// ---------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------

function cell(text) {
	return String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function shorten(text, max = 90) {
	const line = text.trim()
	return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Что изменилось в группе: сторона и первая строка */
function describeGroup(group) {
	const removed = group.removed.length
	const added = group.added.length
	let side = 'различается'
	if (added === 0) side = 'есть только в проде'
	else if (removed === 0) side = 'есть только в цепочке'
	const first = (removed > 0 ? group.removed : group.added)[0]
	return `${side} (−${removed}/+${added}): ${shorten(first)}`
}

function headerValue(raw, name) {
	const match = new RegExp(`^-- ${name} (.+)$`, 'm').exec(raw)
	return match ? match[1].trim() : 'не указана'
}

/** Отчёт на русском. meta — результат parseProdMeta или null; history — compareHistory или null */
export function buildReport({
	date,
	clientVersion,
	prodRaw,
	prodFile,
	comparison,
	meta,
	history,
	chainLength,
	chainServer,
}) {
	const real = comparison.groups.filter((group) => group.label === LABEL_REAL)
	const noise = comparison.groups.filter((group) => group.label === LABEL_NOISE)
	const out = []
	out.push('# Фаза 1: сравнение схемы боевой базы с цепочкой миграций (D-07)', '')
	out.push(`- Дата: ${date}`)
	out.push(`- Клиент: ${clientVersion}`)
	out.push(`- Сервер боевой базы (из заголовка дампа): ${headerValue(prodRaw, 'Dumped from database version')}`)
	out.push(`- Сервер временной базы: ${chainServer}`)
	out.push(`- Дамп боевой базы: \`${prodFile}\` (файл пользователя, в git не добавляется)`)
	out.push(`- Цепочка: ${chainLength} миграций, настоящий раннер, временная база test_d07`)
	out.push(
		`- Строк после нормализации: прод ${comparison.prodLines}, цепочка ${comparison.chainLines}`,
		`- Статус: сравнение выполнено; групп отличий ${comparison.groups.length} (реальных ${real.length}, шума платформы ${noise.length})`,
		''
	)
	out.push('## Классификация отличий', '')
	if (comparison.groups.length === 0) {
		out.push('Нормализованные дампы совпадают: отличий нет.', '')
	} else {
		out.push('| № | Ханк | Класс | Что изменилось | Причина |', '| --- | --- | --- | --- | --- |')
		comparison.groups.forEach((group, index) => {
			out.push(
				`| ${index + 1} | ${cell(group.range)} | ${group.label} | ${cell(describeGroup(group))} | ${cell(group.reason)} |`
			)
		})
		out.push('')
	}
	if (real.length > 0) {
		out.push('## Оценка реальных отличий (для DRZ-01 и Milestone 2)', '')
		comparison.groups.forEach((group, index) => {
			if (group.label !== LABEL_REAL) return
			out.push(
				`- Группа ${index + 1}: <что это значит для DRZ-01 (боевая база != цепочка) и нужна ли обработка в следующей фазе>`
			)
		})
		out.push('')
	}
	out.push('## Часовой пояс и коллация боевой базы (A7)', '')
	if (meta === null) {
		out.push(
			'Метаданные боевой базы не переданы (`--prod-meta`): часовой пояс, коллация и история миграций не проверены.',
			''
		)
	} else {
		const utc = ['UTC', 'Etc/UTC'].includes(meta.timezone)
		out.push(`- \`show timezone\`: ${meta.timezone ?? 'нет в файле'}`)
		out.push(
			utc
				? '- A7 подтверждено: часовой пояс сессии UTC, живые timestamptz читаются верно.'
				: '- **A7 НЕ подтверждено: часовой пояс сессии не UTC, живые времена попыток могут быть сдвинуты.**'
		)
		out.push(`- \`datcollate datctype\`: ${meta.collation ?? 'нет в файле'}`, '')
	}
	out.push('## История миграций (public.__drizzle_migrations)', '')
	if (history === null) {
		out.push('Записи не сверялись: метаданные боевой базы не переданы или в них нет строк миграций.', '')
	} else {
		const label = (tags) => (tags.length > 0 ? tags.join(', ') : 'нет')
		const short = (keys) =>
			keys.length > 0 ? keys.map((key) => (key.length === 64 ? key.slice(0, 12) : key)).join(', ') : 'нет'
		if (history.equal) {
			out.push(
				`Совпадает: ${history.liveCount} живых записей равны ${history.manifestCount} sha256 из migrations-manifest.json.`
			)
		} else {
			out.push('**История боевой базы и репозиторий разошлись или записаны в разном формате.**')
		}
		out.push(
			'',
			`- Живых записей: ${history.liveCount}, миграций в манифесте: ${history.manifestCount}`,
			`- Совпали по sha256 (контрольная сумма проверена): ${history.matchedByHash.length} (${label(history.matchedByHash)})`,
			`- Совпали по имени, в колонке hash лежит имя миграции, а не sha256 (контрольная сумма НЕ проверена): ${history.matchedByTag.length}${history.matchedByTag.length > 0 ? ` (${label(history.matchedByTag)})` : ''}`,
			`- Есть в манифесте, нет вживую ни по sha256, ни по имени: ${label(history.missingLive)}`,
			`- Есть вживую, нет в манифесте: ${short(history.extraLive)}`,
			`- Повторяющиеся записи вживую: ${short(history.duplicates)}`
		)
		if (history.whenMismatch.length > 0)
			out.push(`- created_at отличается от when журнала у (только записи с sha256): ${history.whenMismatch.join(', ')}`)
		if (meta?.unparsed?.length > 0) out.push(`- Строк метаданных не разобрано: ${meta.unparsed.length}`)
		out.push('')
	}
	out.push('## Diff (прод → цепочка)', '')
	out.push('```diff', comparison.diffText === '' ? '(отличий нет)' : comparison.diffText, '```', '')
	return out.join('\n')
}

// ---------------------------------------------------------------------------
// Основной путь
// ---------------------------------------------------------------------------

async function readJson(file) {
	return JSON.parse(await fsp.readFile(file, 'utf8'))
}

async function compareWithProduction({ prodFile, metaFile, reportFile }) {
	const prodRaw = await fsp.readFile(prodFile, 'utf8')
	if (prodRaw.trim() === '') throw new Error(`${prodFile} is empty`)
	const manifest = await readJson(path.join(MIGRATIONS_PATH, 'migrations-manifest.json'))
	const journal = await readJson(path.join(MIGRATIONS_PATH, 'meta/_journal.json'))
	let meta = null
	if (metaFile !== undefined) {
		meta = parseProdMeta(await fsp.readFile(metaFile, 'utf8'))
	}
	const clientVersion = await pgDumpVersion()
	const chainRaw = await withScratchDatabases(['test_d07'], ([database]) => migrateAndDump(database))
	const comparison = await compareDumps(prodRaw, chainRaw)
	const history =
		meta !== null && meta.migrations.length > 0 ? compareHistory(meta.migrations, manifest, journal) : null
	const report = buildReport({
		date: new Date().toISOString().slice(0, 10),
		clientVersion,
		prodRaw,
		prodFile: path.relative(REPO_ROOT, path.resolve(prodFile)),
		comparison,
		meta,
		history,
		chainLength: manifest.migrations.length,
		chainServer: headerValue(chainRaw, 'Dumped from database version'),
	})
	await fsp.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true })
	await fsp.writeFile(reportFile, report)
	const real = comparison.groups.filter((group) => group.label === LABEL_REAL).length
	console.log(
		`compare-schema-dump: ${comparison.groups.length} difference groups (${real} real, ${comparison.groups.length - real} platform noise), report ${path.relative(REPO_ROOT, path.resolve(reportFile))}`
	)
	return 0
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

	const manifest = await readJson(path.join(MIGRATIONS_PATH, 'migrations-manifest.json'))
	const journal = await readJson(path.join(MIGRATIONS_PATH, 'meta/_journal.json'))

	await check('normalize drops comments, blank lines, tokens and the session preamble', () => {
		const sample = [
			'-- PostgreSQL database dump',
			'',
			'\\restrict AbC123',
			"SET client_encoding = 'UTF8';",
			"SELECT pg_catalog.set_config('search_path', '', false);",
			'CREATE TABLE public.t (   ',
			'    id integer',
			');',
			'\\unrestrict AbC123',
		].join('\n')
		expect(
			normalize(sample) === 'CREATE TABLE public.t (\n    id integer\n);',
			`got ${JSON.stringify(normalize(sample))}`
		)
	})

	await check('classifier: noise only when every line matches a platform pattern', () => {
		const noise = classifyLines([
			'ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.users;',
			'GRANT ALL ON TABLE public.users TO anon;',
		])
		expect(noise.label === LABEL_NOISE, `publication + grant: ${noise.label}`)
		const mixed = classifyLines(['GRANT ALL ON TABLE public.users TO anon;', '    id integer'])
		expect(mixed.label === LABEL_REAL, `mixed group: ${mixed.label}`)
		const policy = classifyLines(['CREATE POLICY deny_direct_access ON public.users TO authenticated USING (false);'])
		expect(policy.label === LABEL_REAL, `policy mentioning a Supabase role: ${policy.label}`)
	})

	await check('prod metadata parser and history comparison', () => {
		const rows = manifest.migrations.map((entry, index) => `${entry.sha256} ${journal.entries[index].when}`)
		const meta = parseProdMeta(['UTC', 'en_US.UTF-8 en_US.UTF-8', ...rows, ''].join('\n'))
		expect(meta.timezone === 'UTC' && meta.collation === 'en_US.UTF-8 en_US.UTF-8', 'timezone or collation not parsed')
		expect(meta.migrations.length === manifest.migrations.length, `parsed ${meta.migrations.length} rows`)
		expect(compareHistory(meta.migrations, manifest, journal).equal, 'identical history reported as different')
		const fewer = compareHistory(meta.migrations.slice(0, -1), manifest, journal)
		expect(!fewer.equal && fewer.missingLive.length === 1, 'a missing live hash was not reported')
		const extra = compareHistory(
			[...meta.migrations, { hash: 'f'.repeat(64), createdAt: '1', kind: 'sha256' }],
			manifest,
			journal
		)
		expect(!extra.equal && extra.extraLive.length === 1, 'an extra live hash was not reported')

		// Старый раннер писал в hash имя миграции: такие записи разбираются, помечаются и не считаются расхождением по составу
		const first = manifest.migrations[0]
		const legacyRows = [
			`${first.tag} 1769036412637`,
			'0010_test_drafts 1771698322879',
			...manifest.migrations.slice(1).map((entry, index) => `${entry.sha256} ${journal.entries[index + 1].when}`),
		]
		const legacy = parseProdMeta(['UTC', 'C C', ...legacyRows].join('\n'))
		expect(legacy.migrations[0].kind === 'tag' && legacy.migrations[2].kind === 'sha256', 'row kinds not detected')
		const mixed = compareHistory(legacy.migrations, manifest, journal)
		expect(mixed.matchedByTag.length === 1 && mixed.matchedByTag[0] === first.tag, 'tag row not matched by name')
		expect(mixed.missingLive.length === 0, `tag row counted as missing: ${mixed.missingLive.join(', ')}`)
		expect(mixed.extraLive.length === 1 && mixed.extraLive[0] === '0010_test_drafts', 'orphan tag row not reported')
		expect(
			!mixed.equal && mixed.whenMismatch.length === 0,
			'mixed history reported as equal or when-mismatch on tag rows'
		)
		const report = buildReport({
			date: '2000-01-01',
			clientVersion: 'x',
			prodRaw: '',
			prodFile: 'x',
			comparison: { groups: [], diffText: '', prodLines: 1, chainLines: 1 },
			meta: legacy,
			history: mixed,
			chainLength: manifest.migrations.length,
			chainServer: 'x',
		})
		expect(
			report.includes('контрольная сумма НЕ проверена') && report.includes('0010_test_drafts'),
			'report hides the tag rows'
		)
	})

	await check('two migrated scratch databases give an empty diff', async () => {
		await withScratchDatabases(['test_d07_a', 'test_d07_b'], async ([a, b]) => {
			const rawA = await migrateAndDump(a)
			const rawB = await migrateAndDump(b)
			// Pitfall 13: без нормализации дампы одной схемы различаются токеном \restrict
			expect(rawA.includes('\\restrict ') && rawB.includes('\\restrict '), 'raw dumps carry no \\restrict line')
			expect(rawA !== rawB, 'raw dumps are byte-identical, so the normaliser is not exercised')
			const comparison = await compareDumps(rawA, rawB)
			expect(
				comparison.groups.length === 0 && comparison.diffText === '',
				`diff is not empty:\n${tail(comparison.diffText)}`
			)
			expect(
				comparison.prodLines > 100 && comparison.prodLines === comparison.chainLines,
				'dump is empty or sides differ in size'
			)

			// Контроль в обратную сторону: прод с лишней таблицей и платформенными строками
			const noisy = [
				rawA,
				'GRANT ALL ON TABLE public.users TO anon;',
				'ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.users;',
			].join('\n')
			const noiseOnly = await compareDumps(noisy, rawB)
			expect(
				noiseOnly.groups.length > 0 && noiseOnly.groups.every((group) => group.label === LABEL_NOISE),
				`noise-only diff: ${JSON.stringify(noiseOnly.groups.map((group) => group.label))}`
			)
			const withTable = await compareDumps(`CREATE TABLE public.d07_probe (\n    id integer\n);\n${noisy}`, rawB)
			expect(
				withTable.groups.some((group) => group.label === LABEL_REAL) &&
					withTable.groups.some((group) => group.label === LABEL_NOISE),
				`mixed diff: ${JSON.stringify(withTable.groups.map((group) => group.label))}`
			)
		})
	})

	await check('no temporary directory is left behind', () => {
		expect(activeTmpDirs.size === 0, `${activeTmpDirs.size} tracked directories remain`)
		const left = fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith(TMP_PREFIX))
		expect(left.length === 0, `left in tmpdir: ${left.join(', ')}`)
	})

	if (failures.length > 0) {
		console.log(`compare-schema-dump self-test: FAILED (${failures.length}: ${failures.join(', ')})`)
		return 1
	}
	console.log('compare-schema-dump self-test: OK')
	return 0
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const options = {}
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]
		if (arg === '--self-test') options.selfTest = true
		else if (arg === '--prod') options.prod = argv[++index]
		else if (arg === '--prod-meta') options.prodMeta = argv[++index]
		else if (arg === '--report') options.report = argv[++index]
		else return null
	}
	return options
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	if (options === null) {
		console.error(USAGE)
		return 2
	}
	if (options.selfTest) return selfTest()
	if (!options.prod || !options.report) {
		console.error(USAGE)
		return 2
	}
	return compareWithProduction({ prodFile: options.prod, metaFile: options.prodMeta, reportFile: options.report })
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().then(
		(code) => process.exit(code),
		(error) => {
			console.error(`compare-schema-dump failed: ${error && error.message ? error.message : String(error)}`)
			process.exit(1)
		}
	)
}
