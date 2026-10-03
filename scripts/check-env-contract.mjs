/**
 * Проверка контракта окружения: ключи в коде и в примерах .env.example совпадают (VER-06, T-1-31, T-1-32).
 *
 * Для каждого воркспейса из scripts/env-contract.config.json:
 *   - используемые ключи: process.env.NAME и process.env['NAME'] в исходниках (без node_modules, .next, dist),
 *     плюс ключи zod-схемы (для web файл схемы импортирует server-only, поэтому читается регулярным выражением);
 *   - документированные ключи: строки KEY=value и закомментированные # KEY=value в .env.example;
 *   - ключ из кода без записи в примере (undocumented) и запись без использования (unused) считаются ошибкой,
 *     если ключ не внесён в allowlist с причиной (платформенные ключи, ключи, которые читаются через параметр);
 *   - незакомментированное значение обязано быть заглушкой, а любое значение (и в комментарии) не должно
 *     выглядеть как секрет: префиксы eyJ и sb_, хосты supabase.co/.com и pooler., длинные случайные строки;
 *   - один ключ дважды в одном примере (в том числе закомментированный и нет) считается дубликатом;
 *   - отсутствие примера или пример без единого ключа — ошибка; обязательный ключ zod-схемы не может быть закомментирован.
 *
 * Читаются только исходники, файлы примеров и config JSON. Реальные файлы окружения не открываются никогда,
 * а в сообщениях нет значений, только имена ключей. Результат отсортирован по воркспейсу и ключу.
 *
 * Использование: node scripts/check-env-contract.mjs  (из любого каталога)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const CONFIG_PATH = path.join(REPO_ROOT, 'scripts', 'env-contract.config.json')
const EXAMPLE_FILE = '.env.example'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.cts'])
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage'])

const KEY = '[A-Z][A-Z0-9_]*'
const DOT_READ = new RegExp(`process\\.env\\.(${KEY})`, 'g')
const BRACKET_READ = new RegExp(`process\\.env\\[\\s*['"](${KEY})['"]\\s*\\]`, 'g')
const ZOD_KEY = new RegExp(`^\\s*(${KEY})\\s*:\\s*z\\.([^\\n]*)$`, 'gm')
const EXAMPLE_LINE = new RegExp(`^\\s*(#\\s*)?(${KEY})=(.*)$`)

/** Значения-заглушки: пустое, <...>, change-me*, example*, URL без хоста, локальный адрес, число, флаг */
const PLACEHOLDER_PATTERNS = [
	/^$/,
	/^<.+>$/,
	/^change-?me/i,
	/^example/i,
	/^postgres(ql)?:\/\/$/,
	/^https?:\/\/localhost(:\d+)?$/,
	/^\d+$/,
	/^(true|false)$/,
	/^development$/,
	/^(info|debug)$/,
]

/** Похоже ли значение на секрет или живой адрес (проверяется и у закомментированных записей) */
export function isUnsafeValue(value) {
	if (value.startsWith('eyJ') || value.startsWith('sb_')) return true
	if (/supabase\.(co|com)/i.test(value) || value.includes('pooler.')) return true
	return /[A-Za-z0-9+/=_-]{32,}/.test(value)
}

/** Годится ли значение для незакомментированной записи примера */
export function isPlaceholder(value) {
	return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
}

/** Разбор .env.example: записи ключей по строкам; пояснения без KEY= игнорируются */
export function parseExample(text) {
	const entries = []
	text.split(/\r?\n/).forEach((line, index) => {
		const match = EXAMPLE_LINE.exec(line)
		if (!match) return
		entries.push({ key: match[2], commented: Boolean(match[1]), value: match[3].trim(), line: index + 1 })
	})
	return entries
}

/** Рекурсивный обход в отсортированном порядке: исходные файлы под root */
function walkSources(root, found) {
	for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(root, entry.name)
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRS.has(entry.name)) walkSources(full, found)
		} else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			found.push(full)
		}
	}
}

/** Ключи, которые код читает как process.env.NAME / process.env['NAME'] */
export function collectUsedKeys(dir, sources) {
	const keys = new Set()
	const errors = []
	const files = []
	for (const source of sources) {
		const full = path.join(dir, source)
		if (!fs.existsSync(full)) {
			errors.push(`missing source: ${source}`)
			continue
		}
		if (fs.statSync(full).isDirectory()) walkSources(full, files)
		else files.push(full)
	}
	for (const file of files) {
		const text = fs.readFileSync(file, 'utf8')
		for (const pattern of [DOT_READ, BRACKET_READ]) {
			for (const match of text.matchAll(pattern)) keys.add(match[1])
		}
	}
	return { keys, errors }
}

/** Ключи zod-схемы и признак обязательности (нет .optional()) */
export function collectZodKeys(dir, zodFile) {
	const required = new Map()
	const full = path.join(dir, zodFile)
	if (!fs.existsSync(full)) return { required, errors: [`missing zod schema file: ${zodFile}`] }
	for (const match of fs.readFileSync(full, 'utf8').matchAll(ZOD_KEY)) {
		required.set(match[1], !/\.optional\(\)|\.default\(/.test(match[2]))
	}
	return { required, errors: [] }
}

function finding(workspace, key, text) {
	return { workspace, key, message: `${workspace}: ${text}` }
}

function compareFindings(a, b) {
	return (
		a.workspace.localeCompare(b.workspace, 'en') ||
		a.key.localeCompare(b.key, 'en') ||
		a.message.localeCompare(b.message, 'en')
	)
}

/** Проверка одного воркспейса */
function checkWorkspace(workspace, allowlistEntries) {
	const { name, dir, sources, zodFile } = workspace
	const findings = []

	const allowed = new Set()
	for (const entry of allowlistEntries) {
		if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
			findings.push(finding(name, entry.key, `allowlist entry without a reason: ${entry.key}`))
		}
		allowed.add(entry.key)
	}

	const used = collectUsedKeys(dir, sources)
	for (const error of used.errors) findings.push(finding(name, '', error))
	const zod = zodFile ? collectZodKeys(dir, zodFile) : { required: new Map(), errors: [] }
	for (const error of zod.errors) findings.push(finding(name, '', error))
	for (const key of zod.required.keys()) used.keys.add(key)

	const examplePath = path.join(dir, EXAMPLE_FILE)
	if (!fs.existsSync(examplePath)) {
		findings.push(finding(name, '', 'missing example file'))
		return findings
	}
	const entries = parseExample(fs.readFileSync(examplePath, 'utf8'))
	if (entries.length === 0) {
		findings.push(finding(name, '', 'example has no keys'))
		return findings
	}

	const counts = new Map()
	for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1)
	for (const [key, count] of counts) {
		if (count > 1) findings.push(finding(name, key, `duplicate: ${key}`))
	}

	for (const entry of entries) {
		if (isUnsafeValue(entry.value)) {
			findings.push(finding(name, entry.key, `unsafe value: ${entry.key}`))
		} else if (!entry.commented && !isPlaceholder(entry.value)) {
			findings.push(finding(name, entry.key, `not a placeholder: ${entry.key}`))
		}
		if (entry.commented && zod.required.get(entry.key) === true && counts.get(entry.key) === 1) {
			findings.push(finding(name, entry.key, `required key is commented: ${entry.key}`))
		}
	}

	const documented = new Set(counts.keys())
	for (const key of used.keys) {
		if (!documented.has(key) && !allowed.has(key)) findings.push(finding(name, key, `undocumented: ${key}`))
	}
	for (const key of documented) {
		if (!used.keys.has(key) && !allowed.has(key)) findings.push(finding(name, key, `unused: ${key}`))
	}
	return findings
}

/**
 * Сверка кода и примеров. workspaces: [{ name, dir, sources, zodFile? }] (dir абсолютный),
 * config: { allowlist: { [name]: [{ key, reason }] } }. Возвращает отсортированные находки { workspace, key, message }.
 */
export function checkEnvContract({ workspaces, config }) {
	const findings = []
	for (const workspace of workspaces) {
		findings.push(...checkWorkspace(workspace, config.allowlist?.[workspace.name] ?? []))
	}
	return findings.sort(compareFindings)
}

/** Воркспейсы из config JSON: пути относительно корня репозитория */
export function workspacesFromConfig(config, repoRoot = REPO_ROOT) {
	return Object.entries(config.workspaces).map(([name, spec]) => ({
		name,
		dir: path.join(repoRoot, name),
		sources: spec.sources,
		...(spec.zodFile ? { zodFile: spec.zodFile } : {}),
	}))
}

function main() {
	const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
	const findings = checkEnvContract({ workspaces: workspacesFromConfig(config), config })
	if (findings.length === 0) {
		console.log('check-env-contract: OK')
		return 0
	}
	for (const item of findings) console.error(`check-env-contract: ${item.message}`)
	console.error(`check-env-contract: ${findings.length} finding(s)`)
	return 1
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
