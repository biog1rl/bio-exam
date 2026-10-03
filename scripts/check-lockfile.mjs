/**
 * Охранник единственного lock-файла (VER-04, T-1-18).
 *
 * В репозитории допустим один менеджер пакетов: Yarn 4 с корневым yarn.lock. Второй lock-файл
 * меняет версии зависимостей, которые ставят CI и Vercel, поэтому любой из package-lock.json,
 * npm-shrinkwrap.json, pnpm-lock.yaml, bun.lock, bun.lockb в дереве (в любой папке) нарушает правило,
 * как и отсутствие корневого yarn.lock.
 *
 * Дерево берётся из git: отслеживаемые и неигнорируемые файлы (node_modules отсекает .gitignore).
 * Проверяется рабочее дерево, а не индекс: путь, который git ещё перечисляет, но которого уже нет
 * на диске (файл удалён и удаление не добавлено в индекс), отбрасывается через existingPaths.
 *
 * Использование: node scripts/check-lockfile.mjs  (из корня репозитория или откуда угодно)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN_BASENAMES = new Set([
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'bun.lock',
	'bun.lockb',
])
const REQUIRED_LOCKFILE = 'yarn.lock'
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Имя файла в пути с прямыми или обратными слешами */
function basenameOf(file) {
	return file.split(/[\\/]/).pop()
}

/**
 * Нарушения по списку путей: запрещённые lock-файлы (отсортированы) и, если корневого yarn.lock
 * нет, строка "missing: yarn.lock ...". Совпадение только по точному имени файла.
 */
export function findLockfileViolations(paths) {
	const forbidden = paths.filter((file) => FORBIDDEN_BASENAMES.has(basenameOf(file))).sort()
	if (!paths.includes(REQUIRED_LOCKFILE)) {
		return [...forbidden, `missing: ${REQUIRED_LOCKFILE} (the root Yarn lockfile must exist)`]
	}
	return forbidden
}

/**
 * Оставляет пути, для которых exists(path) истинно. Предикат передаётся снаружи, чтобы тесты
 * работали без git и без файловой системы.
 */
export function existingPaths(paths, exists) {
	return paths.filter((file) => exists(file))
}

/** Отслеживаемые и неигнорируемые пути репозитория относительно корня */
function listRepositoryPaths(cwd) {
	const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	return [...new Set(output.split('\0').filter(Boolean))]
}

function main() {
	let paths
	try {
		paths = listRepositoryPaths(REPO_ROOT)
	} catch (error) {
		console.error(`check-lockfile: cannot list repository files: ${error.message}`)
		return 1
	}
	// --cached перечисляет и файл, удалённый с диска без git rm: в рабочем дереве его нет
	const present = existingPaths(paths, (file) => fs.existsSync(path.join(REPO_ROOT, file)))
	const violations = findLockfileViolations(present)
	if (violations.length === 0) {
		console.log('check-lockfile: OK')
		return 0
	}
	for (const violation of violations) console.error(`check-lockfile: ${violation}`)
	return 1
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
