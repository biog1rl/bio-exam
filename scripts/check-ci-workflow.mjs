/**
 * Статическая политика CI (VER-03, D-20..D-24, T-1-39..T-1-41): .github/workflows/ci.yml не пишет
 * в репозиторий и внешние системы, не читает секреты репозитория, не публикует и не запускает код
 * pull request с повышенными правами. Запускается внутри yarn verify (шаг ci-workflow).
 *
 * Без YAML-библиотеки: проверка построчная, по тексту. Запретные фрагменты ищутся по всему файлу,
 * включая комментарии, без учёта регистра. Обязательные элементы ищутся только в строках без
 * комментариев, чтобы закомментированная команда не считалась присутствующей.
 *
 * Использование: node scripts/check-ci-workflow.mjs  ->  "check-ci-workflow: OK" или список находок, код 1
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_PATH = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url))

/** Запретные фрагменты (без учёта регистра): запись, секреты, публикация, хостинг, обходные триггеры */
const FORBIDDEN = [
	'pull_request_target',
	'secrets.',
	'deploy',
	'vercel',
	': write',
	'write-all',
	'id-token',
	'upload-artifact',
	'git push',
]

/** Задачи, которые обязаны быть в файле, и их обязательные команды в порядке выполнения */
const REQUIRED_JOBS = ['verify', 'build', 'e2e']

/** Последовательность общих шагов каждой задачи (VER-03 ordering) */
const COMMON_ORDER = [
	{ label: 'actions/checkout', pattern: /uses:\s*actions\/checkout@/ },
	{ label: 'corepack enable', pattern: /run:\s*corepack enable\b/ },
	{ label: 'actions/setup-node', pattern: /uses:\s*actions\/setup-node@/ },
	{ label: 'yarn install --immutable', pattern: /run:\s*yarn install --immutable\b/ },
]

/** Дополнительные шаги по задачам: каждая строка идёт после предыдущей и после yarn install */
const JOB_ORDER = {
	verify: [{ label: 'yarn verify', pattern: /run:\s*yarn verify\b/ }],
	build: [
		{ label: 'yarn workspace @bio-exam/rbac build', pattern: /run:\s*yarn workspace @bio-exam\/rbac build\b/ },
		{ label: 'check-rbac-dist', pattern: /run:\s*node scripts\/check-rbac-dist\.mjs\b/ },
		{ label: 'yarn workspace @bio-exam/server build', pattern: /run:\s*yarn workspace @bio-exam\/server build\b/ },
		{ label: '/healthz', pattern: /\/healthz\b/ },
		{ label: 'yarn workspace @bio-exam/web build', pattern: /run:\s*yarn workspace @bio-exam\/web build\b/ },
	],
	e2e: [
		{ label: 'yarn playwright install', pattern: /run:\s*yarn playwright install\b/ },
		{ label: 'yarn e2e', pattern: /run:\s*yarn e2e\b/ },
	],
}

/** Строки текста без комментариев (номера строк сохраняются) */
function stripComments(text) {
	return text.split(/\r?\n/).map((line) => {
		if (/^\s*#/.test(line)) return ''
		// Комментарий после значения; строки с кавычками не трогаем
		if (!/["']/.test(line)) return line.replace(/\s+#.*$/, '')
		return line
	})
}

function indentOf(line) {
	return line.length - line.trimStart().length
}

/** Индекс первой строки, подходящей под шаблон, начиная с from; -1 если нет */
function indexOfLine(lines, pattern, from = 0, to = lines.length) {
	for (let i = from; i < to; i += 1) if (pattern.test(lines[i])) return i
	return -1
}

/** Тело блока: строки глубже отступа заголовка (пустые пропускаются) */
function blockBody(lines, headerIndex) {
	const headerIndent = indentOf(lines[headerIndex])
	const body = []
	for (let i = headerIndex + 1; i < lines.length; i += 1) {
		if (lines[i].trim() === '') continue
		if (indentOf(lines[i]) <= headerIndent) break
		body.push(lines[i])
	}
	return body
}

/** Задачи из блока jobs: имя -> { start, end } по строкам */
function findJobs(lines) {
	const jobsAt = indexOfLine(lines, /^jobs:\s*$/)
	const jobs = new Map()
	if (jobsAt === -1) return jobs
	let current = null
	for (let i = jobsAt + 1; i < lines.length; i += 1) {
		const line = lines[i]
		if (line.trim() === '') continue
		if (indentOf(line) === 0) break
		const match = /^ {2}([\w-]+):\s*$/.exec(line)
		if (match && indentOf(line) === 2) {
			if (current) current.end = i
			current = { name: match[1], start: i, end: lines.length }
			jobs.set(match[1], current)
		}
	}
	return jobs
}

function checkTriggers(lines, findings) {
	const onAt = indexOfLine(lines, /^on:\s*$/)
	if (onAt === -1) {
		findings.push('missing: on: block with pull_request and push triggers')
		return
	}
	const pr = indexOfLine(lines, /^ {2}pull_request:/, onAt)
	if (pr === -1) {
		findings.push('missing: pull_request trigger')
	} else {
		const inline = lines[pr].replace(/^ {2}pull_request:/, '').trim()
		if ((inline !== '' && inline !== '{}') || blockBody(lines, pr).length > 0) {
			findings.push('pull_request must have no filters: a docs-only change still runs every job')
		}
	}
	const push = indexOfLine(lines, /^ {2}push:/, onAt)
	let pushOk = false
	if (push !== -1) {
		const body = blockBody(lines, push)
		const inline = lines[push].replace(/^ {2}push:/, '').trim()
		const text = [inline, ...body].join('\n')
		const flow = /branches:\s*\[([^\]]*)\]/.exec(text)
		let branches = []
		if (flow) {
			branches = flow[1]
				.split(',')
				.map((b) => b.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean)
		} else {
			const at = body.findIndex((l) => /^\s*branches:\s*$/.test(l))
			if (at !== -1) {
				for (let i = at + 1; i < body.length && /^\s*-\s*/.test(body[i]); i += 1) {
					branches.push(
						body[i]
							.replace(/^\s*-\s*/, '')
							.trim()
							.replace(/^['"]|['"]$/g, '')
					)
				}
			}
		}
		pushOk = branches.length === 1 && branches[0] === 'master'
		if (branches.includes('master') && branches.length > 1) {
			findings.push('push must trigger on master only')
			return
		}
	}
	if (!pushOk) findings.push('missing: push to master (push: with branches: [master])')
}

function checkPermissions(lines, findings) {
	const at = indexOfLine(lines, /^permissions:/)
	if (at === -1) {
		findings.push('missing: top-level permissions: contents: read')
	} else {
		const inline = lines[at].replace(/^permissions:/, '').trim()
		const entries = inline !== '' ? inline.replace(/^\{|\}$/g, '').split(',') : blockBody(lines, at)
		const normalized = entries.map((e) => e.trim().replace(/\s+/g, ' ')).filter(Boolean)
		if (normalized.length !== 1 || normalized[0] !== 'contents: read') {
			findings.push('permissions must be exactly "contents: read" at the top level')
		}
	}
	if (indexOfLine(lines, /^\s+permissions:/) !== -1) {
		findings.push('job-level permissions are not allowed: the top-level read-only token applies to every job')
	}
}

function checkOrder(jobName, jobLines, sequence, findings) {
	let previous = null
	for (const item of sequence) {
		const at = indexOfLine(jobLines, item.pattern)
		if (at === -1) {
			findings.push(`job ${jobName}: missing ${item.label}`)
			previous = null
			continue
		}
		if (previous && at < previous.at) {
			findings.push(`job ${jobName}: ${previous.label} must come before ${item.label}`)
		}
		previous = { at, label: item.label }
	}
}

function checkJob(jobName, jobLines, findings) {
	checkOrder(jobName, jobLines, [...COMMON_ORDER, ...(JOB_ORDER[jobName] ?? [])], findings)

	const checkouts = jobLines.filter((l) => /uses:\s*actions\/checkout@/.test(l)).length
	const persist = jobLines.filter((l) => /persist-credentials:\s*false\b/.test(l)).length
	if (checkouts === 0 || persist < checkouts) {
		findings.push(`job ${jobName}: every actions/checkout needs persist-credentials: false`)
	}
	for (const line of jobLines) {
		const uses = /\buses:\s*(\S+)/.exec(line)
		if (uses && !uses[1].startsWith('actions/')) {
			findings.push(`job ${jobName}: only official actions/* are allowed, found ${uses[1]}`)
		}
	}

	if (jobName === 'verify') {
		const guard = indexOfLine(jobLines, /run:\s*node scripts\/check-lockfile\.mjs\b/)
		const install = indexOfLine(jobLines, /run:\s*yarn install --immutable\b/)
		if (guard === -1) findings.push('job verify: missing node scripts/check-lockfile.mjs')
		else if (install !== -1 && guard > install)
			findings.push('job verify: check-lockfile must come before yarn install')
	}
	if (jobName === 'verify' || jobName === 'e2e') {
		if (indexOfLine(jobLines, /image:\s*postgres:17\b/) === -1)
			findings.push(`job ${jobName}: missing postgres:17 service`)
		if (indexOfLine(jobLines, /TEST_DATABASE_URL:/) === -1) findings.push(`job ${jobName}: missing TEST_DATABASE_URL`)
	}
	if (jobName === 'build' && indexOfLine(jobLines, /NODE_ENV:\s*production\b/) === -1) {
		findings.push('job build: missing NODE_ENV: production for the start smoke')
	}
}

/** Находки по тексту ci.yml; пустой массив означает, что политика выполнена */
export function checkCiWorkflow(text) {
	const findings = []
	const lower = text.toLowerCase()
	for (const token of FORBIDDEN) {
		if (lower.includes(token)) findings.push(`forbidden: "${token}"`)
	}
	if (/^\s*paths(-ignore)?:/m.test(text) || /^\s*branches-ignore:/m.test(text)) {
		findings.push('forbidden: paths/branches-ignore filters (every change must run every job)')
	}

	const lines = stripComments(text)
	checkTriggers(lines, findings)
	checkPermissions(lines, findings)
	if (indexOfLine(lines, /^concurrency:/) === -1 || indexOfLine(lines, /cancel-in-progress:\s*true\b/) === -1) {
		findings.push('missing: concurrency with cancel-in-progress: true')
	}

	const jobs = findJobs(lines)
	for (const name of REQUIRED_JOBS) {
		if (!jobs.has(name)) findings.push(`missing: job ${name}`)
	}
	for (const [name, { start, end }] of jobs) {
		checkJob(name, lines.slice(start, end), findings)
	}
	return findings
}

function main() {
	let text
	try {
		text = fs.readFileSync(WORKFLOW_PATH, 'utf8')
	} catch (error) {
		console.error(`check-ci-workflow: cannot read ${path.relative(process.cwd(), WORKFLOW_PATH)}: ${error.message}`)
		return 1
	}
	const findings = checkCiWorkflow(text)
	if (findings.length === 0) {
		console.log('check-ci-workflow: OK')
		return 0
	}
	console.error('check-ci-workflow: FAILED')
	for (const finding of findings) console.error(`  ${finding}`)
	return 1
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(main())
