import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_WEB_DIR = path.join(REPO_ROOT, 'app', 'web')
const STATS_RELATIVE = path.join('.next', 'diagnostics', 'route-bundle-stats.json')
const DEFAULT_BUDGET_PATH = path.join(REPO_ROOT, 'scripts', 'editor-bundle-budget.json')
const USAGE = 'usage: node scripts/editor-bundle.mjs --report|--check [--web-dir <app/web>] [--budget <budget.json>]'

export const EDITOR_ROUTES = [
	'/admin/tests/[topicSlug]/[testSlug]/questions/[questionId]',
	'/admin/tests/[topicSlug]/[testSlug]/questions/drafts/[draftId]',
]

export const EMOJI_MARKER = 'grinning face with big eyes'

export class EditorBundleError extends Error {
	constructor(message) {
		super(message)
		this.name = 'EditorBundleError'
	}
}

function readStats(statsPath) {
	if (!fs.existsSync(statsPath)) {
		throw new EditorBundleError(`${statsPath} not found: run the web build first (yarn workspace @bio-exam/web build)`)
	}
	let parsed
	try {
		parsed = JSON.parse(fs.readFileSync(statsPath, 'utf8'))
	} catch (error) {
		throw new EditorBundleError(`${statsPath} is not valid JSON: ${error.message}`)
	}
	if (!Array.isArray(parsed)) throw new EditorBundleError(`${statsPath} is not an array of routes`)
	return parsed
}

function measureRoute(webDir, entry) {
	const chunkPaths = Array.isArray(entry.firstLoadChunkPaths) ? entry.firstLoadChunkPaths : []
	let raw = 0
	let gzip = 0
	const emojiChunks = []
	for (const chunkPath of chunkPaths) {
		const full = path.resolve(webDir, chunkPath)
		if (!fs.existsSync(full)) throw new EditorBundleError(`${entry.route}: first-load chunk ${full} not found`)
		const data = fs.readFileSync(full)
		raw += data.length
		gzip += zlib.gzipSync(data).length
		if (data.includes(EMOJI_MARKER)) emojiChunks.push(chunkPath)
	}
	return {
		route: entry.route,
		firstLoadChunks: chunkPaths.length,
		firstLoadRawBytes: raw,
		firstLoadGzipBytes: gzip,
		nextFirstLoadUncompressedJsBytes: entry.firstLoadUncompressedJsBytes ?? null,
		emojiInFirstLoad: emojiChunks.length > 0,
		emojiChunks,
	}
}

export function editorBundleReport({ webDir = DEFAULT_WEB_DIR } = {}) {
	const statsPath = path.join(webDir, STATS_RELATIVE)
	const stats = readStats(statsPath)
	const routes = EDITOR_ROUTES.map((route) => {
		const entry = stats.find((item) => item && item.route === route)
		if (!entry) {
			const known = stats.map((item) => item && item.route).filter((value) => typeof value === 'string')
			throw new EditorBundleError(
				`${statsPath}: editor route ${route} is missing; routes with "questions": ${known.filter((value) => value.includes('questions')).join(', ') || 'none'}`
			)
		}
		return measureRoute(webDir, entry)
	})
	return { statsFile: path.relative(REPO_ROOT, statsPath) || statsPath, marker: EMOJI_MARKER, routes }
}

function readBudget(budgetPath) {
	if (!fs.existsSync(budgetPath)) throw new EditorBundleError(`${budgetPath} not found`)
	let parsed
	try {
		parsed = JSON.parse(fs.readFileSync(budgetPath, 'utf8'))
	} catch (error) {
		throw new EditorBundleError(`${budgetPath} is not valid JSON: ${error.message}`)
	}
	if (!parsed || typeof parsed.routes !== 'object' || parsed.routes === null) {
		throw new EditorBundleError(`${budgetPath} has no "routes" object`)
	}
	return parsed.routes
}

function isByteLimit(value) {
	return Number.isInteger(value) && value > 0
}

export function editorBundleCheck({ webDir = DEFAULT_WEB_DIR, budgetPath = DEFAULT_BUDGET_PATH } = {}) {
	const budget = readBudget(budgetPath)
	const report = editorBundleReport({ webDir })
	const problems = []
	for (const route of report.routes) {
		const limit = budget[route.route]
		if (!limit || !isByteLimit(limit.raw) || !isByteLimit(limit.gzip)) {
			problems.push(`${route.route}: no raw/gzip byte limits in ${budgetPath}`)
			continue
		}
		if (route.firstLoadRawBytes > limit.raw) {
			problems.push(`${route.route}: first-load raw ${route.firstLoadRawBytes} bytes > budget ${limit.raw}`)
		}
		if (route.firstLoadGzipBytes > limit.gzip) {
			problems.push(`${route.route}: first-load gzip ${route.firstLoadGzipBytes} bytes > budget ${limit.gzip}`)
		}
		if (route.emojiInFirstLoad) {
			problems.push(`${route.route}: emoji-list data in first-load chunks ${route.emojiChunks.join(', ')}`)
		}
	}
	return { report, problems }
}

function parseArgs(argv) {
	const options = { mode: null, webDir: DEFAULT_WEB_DIR, budgetPath: DEFAULT_BUDGET_PATH }
	const setMode = (mode) => {
		if (options.mode && options.mode !== mode)
			throw new EditorBundleError(`--report and --check are exclusive\n${USAGE}`)
		options.mode = mode
	}
	const valueAt = (index, flag) => {
		const value = argv[index + 1]
		if (!value) throw new EditorBundleError(`${flag} needs a path\n${USAGE}`)
		return path.resolve(value)
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--report') setMode('report')
		else if (arg === '--check') setMode('check')
		else if (arg === '--web-dir') {
			options.webDir = valueAt(index, '--web-dir')
			index += 1
		} else if (arg.startsWith('--web-dir=')) options.webDir = path.resolve(arg.slice('--web-dir='.length))
		else if (arg === '--budget') {
			options.budgetPath = valueAt(index, '--budget')
			index += 1
		} else if (arg.startsWith('--budget=')) options.budgetPath = path.resolve(arg.slice('--budget='.length))
		else throw new EditorBundleError(`unknown argument ${arg}\n${USAGE}`)
	}
	return options
}

function formatRoute(route) {
	return `${route.route}: raw ${route.firstLoadRawBytes}, gzip ${route.firstLoadGzipBytes}`
}

function main(argv) {
	try {
		const options = parseArgs(argv)
		if (options.mode === 'report') {
			process.stdout.write(`${JSON.stringify(editorBundleReport({ webDir: options.webDir }), null, '\t')}\n`)
			return 0
		}
		if (options.mode === 'check') {
			const { report, problems } = editorBundleCheck({ webDir: options.webDir, budgetPath: options.budgetPath })
			if (problems.length > 0) {
				for (const problem of problems) console.error(`editor-bundle: ${problem}`)
				return 1
			}
			for (const route of report.routes) console.log(formatRoute(route))
			console.log('editor bundle OK')
			return 0
		}
		console.error(USAGE)
		return 2
	} catch (error) {
		if (error instanceof EditorBundleError) {
			console.error(`editor-bundle: ${error.message}`)
			return 1
		}
		throw error
	}
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = main(process.argv.slice(2))
