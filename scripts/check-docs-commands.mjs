/**
 * Проверка команд yarn в документации: то, что написано в README, существует (VER-07).
 *
 * Проверяются README.md, app/server/README.md и AGENTS.md (в этом порядке). Команды `yarn ...` берутся из
 * инлайн-кода и кодовых блоков, проза вне кода не учитывается. Команда допустима, если это:
 *   - скрипт корневого package.json;
 *   - `yarn workspace <имя> <скрипт>`, где скрипт есть именно в package.json этого воркспейса
 *     (скрипт другого воркспейса не подходит), или встроенная команда yarn;
 *   - встроенная команда yarn (install, add, remove, dlx, why, workspace, workspaces, npm, constraints и др.);
 *   - исполняемый файл пакета из devDependencies корня (turbo, oxfmt, playwright).
 * Кроме того, нужные файлы обязаны существовать, а в README.md должны быть команды yarn verify и yarn e2e.
 * Находки идут в порядке файлов, затем строк.
 *
 * Использование: node scripts/check-docs-commands.mjs  (из любого каталога)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Проверяемые файлы в порядке вывода находок */
export const DOC_FILES = ['README.md', 'app/server/README.md', 'AGENTS.md']
export const SKILLS_DIR = '.agents/skills'
const SKILL_FILE = /^\.agents\/skills\/[^/]+\/SKILL\.md$/
/** Команды, которые обязан показывать README.md */
const README_REQUIRED_SCRIPTS = ['verify', 'e2e']

/** Встроенные команды yarn 4: они не обязаны быть в package.json */
const YARN_BUILTINS = new Set([
	'install',
	'add',
	'remove',
	'up',
	'dlx',
	'why',
	'workspace',
	'workspaces',
	'npm',
	'constraints',
	'run',
	'exec',
	'dedupe',
	'info',
	'config',
	'set',
	'init',
	'link',
	'unplug',
	'rebuild',
	'patch',
	'plugin',
	'cache',
	'bin',
	'node',
	'version',
])

const SCRIPT_NAME = /^[A-Za-z0-9][\w:.-]*$/

/** Команды yarn из инлайн-кода и кодовых блоков: [{ line, args }], args без самого слова yarn */
export function extractYarnCommands(text) {
	const commands = []
	let inFence = false
	text.split(/\r?\n/).forEach((rawLine, index) => {
		const line = index + 1
		if (/^\s*(```|~~~)/.test(rawLine)) {
			inFence = !inFence
			return
		}
		const codeParts = inFence ? [rawLine] : [...rawLine.matchAll(/`([^`]+)`/g)].map((match) => match[1])
		for (const code of codeParts) {
			const withoutPrompt = code.replace(/^\s*\$\s+/, '')
			const withoutComment = withoutPrompt.replace(/(^|\s)#.*$/, '')
			for (const segment of withoutComment.split(/&&|\|\||[;|]/)) {
				const match = /(?:^|\s)yarn\s+(\S.*)$/.exec(segment)
				if (match) commands.push({ line, args: match[1].trim().split(/\s+/) })
			}
		}
	})
	return commands
}

/** Скрипт без хвостовой пунктуации: "verify:" из "yarn verify: OK" это verify */
function cleanScriptName(token) {
	return token.replace(/[:;,.)]+$/, '')
}

/** Одна команда: текст ошибки или null */
function judgeCommand(args, packages) {
	const first = args[0]
	if (first.startsWith('-')) return null
	const name = cleanScriptName(first)
	if (!SCRIPT_NAME.test(name)) return null

	if (name === 'workspace') {
		const workspaceName = args[1]
		if (workspaceName === undefined) return null
		const workspace = packages.workspaces[workspaceName]
		if (!workspace) return `unknown workspace ${workspaceName}`
		if (args[2] === undefined) return null
		let script = cleanScriptName(args[2])
		if (script === 'run' && args[3] !== undefined) script = cleanScriptName(args[3])
		if (!SCRIPT_NAME.test(script)) return null
		if (Object.hasOwn(workspace.scripts ?? {}, script) || YARN_BUILTINS.has(script)) return null
		return `unknown script ${script} in workspace ${workspaceName}`
	}

	if (name === 'run' && args[1] !== undefined) {
		const script = cleanScriptName(args[1])
		if (!SCRIPT_NAME.test(script) || Object.hasOwn(packages.root.scripts ?? {}, script)) return null
		return `unknown script ${script}`
	}

	if (YARN_BUILTINS.has(name)) return null
	if (Object.hasOwn(packages.root.scripts ?? {}, name)) return null
	if ((packages.root.bins ?? []).includes(name)) return null
	return `unknown script ${name}`
}

/**
 * files: { [путь от корня]: текст } (нет ключа: файл отсутствует);
 * packages: { root: { scripts, bins }, workspaces: { [имя]: { scripts } } }.
 * Возвращает находки { file, line, message } в порядке DOC_FILES, затем строк.
 */
export function checkDocsCommands({ files, packages }) {
	const findings = []
	const skillFiles = Object.keys(files)
		.filter((file) => SKILL_FILE.test(file))
		.sort()
	for (const file of [...DOC_FILES, ...skillFiles]) {
		const text = files[file]
		if (typeof text !== 'string') {
			findings.push({ file, line: 0, message: `${file}: missing file` })
			continue
		}
		const commands = extractYarnCommands(text)
		const mentioned = new Set()
		for (const command of commands) {
			const problem = judgeCommand(command.args, packages)
			if (problem) findings.push({ file, line: command.line, message: `${file}:${command.line}: ${problem}` })
			else mentioned.add(cleanScriptName(command.args[0]))
		}
		if (file === 'README.md') {
			for (const script of README_REQUIRED_SCRIPTS) {
				if (!mentioned.has(script)) findings.push({ file, line: 0, message: `${file}: must mention yarn ${script}` })
			}
		}
	}
	return findings
}

/** Чтение package.json; отсутствие файла это ошибка пакета, а не молчаливая пустота */
function readPackageJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** Имена исполняемых файлов пакета из его package.json в node_modules */
function binsOf(repoRoot, dependency) {
	const file = path.join(repoRoot, 'node_modules', dependency, 'package.json')
	if (!fs.existsSync(file)) return []
	const { bin } = readPackageJson(file)
	if (typeof bin === 'string') return [dependency.split('/').pop()]
	return bin ? Object.keys(bin) : []
}

/** Карта скриптов корня и воркспейсов по package.json репозитория */
export function loadPackages(repoRoot = REPO_ROOT) {
	const rootPackage = readPackageJson(path.join(repoRoot, 'package.json'))
	const bins = Object.keys(rootPackage.devDependencies ?? {}).flatMap((dependency) => binsOf(repoRoot, dependency))
	const workspaces = {}
	for (const pattern of rootPackage.workspaces ?? []) {
		const parents = pattern.endsWith('/*') ? listChildren(repoRoot, pattern.slice(0, -2)) : [pattern]
		for (const relative of parents) {
			const file = path.join(repoRoot, relative, 'package.json')
			if (!fs.existsSync(file)) continue
			const manifest = readPackageJson(file)
			if (manifest.name) workspaces[manifest.name] = { scripts: manifest.scripts ?? {} }
		}
	}
	return { root: { scripts: rootPackage.scripts ?? {}, bins: [...new Set(bins)].sort() }, workspaces }
}

function listChildren(repoRoot, relativeDir) {
	const dir = path.join(repoRoot, relativeDir)
	if (!fs.existsSync(dir)) return []
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.posix.join(relativeDir, entry.name))
		.sort()
}

/** Тексты документов репозитория; отсутствующий файл просто не попадает в карту */
export function loadDocs(repoRoot = REPO_ROOT) {
	const files = {}
	for (const file of DOC_FILES) {
		const full = path.join(repoRoot, file)
		if (fs.existsSync(full)) files[file] = fs.readFileSync(full, 'utf8')
	}
	for (const skillDir of listChildren(repoRoot, SKILLS_DIR)) {
		const file = path.posix.join(skillDir, 'SKILL.md')
		const full = path.join(repoRoot, file)
		if (fs.existsSync(full)) files[file] = fs.readFileSync(full, 'utf8')
	}
	return files
}

function main() {
	const findings = checkDocsCommands({ files: loadDocs(), packages: loadPackages() })
	if (findings.length === 0) {
		console.log('check-docs-commands: OK')
		return 0
	}
	for (const item of findings) console.error(`check-docs-commands: ${item.message}`)
	console.error(`check-docs-commands: ${findings.length} finding(s)`)
	return 1
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
