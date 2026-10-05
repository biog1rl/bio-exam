import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_WEB_DIR = path.join(REPO_ROOT, 'app', 'web')
const STATS_RELATIVE = path.join('.next', 'diagnostics', 'route-bundle-stats.json')
const USAGE = 'usage: node scripts/editor-bundle.mjs --report [--web-dir <app/web>]'

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

function parseArgs(argv) {
	const options = { report: false, webDir: DEFAULT_WEB_DIR }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--report') options.report = true
		else if (arg === '--web-dir') {
			const value = argv[index + 1]
			if (!value) throw new EditorBundleError(`--web-dir needs a directory\n${USAGE}`)
			options.webDir = path.resolve(value)
			index += 1
		} else if (arg.startsWith('--web-dir=')) options.webDir = path.resolve(arg.slice('--web-dir='.length))
		else throw new EditorBundleError(`unknown argument ${arg}\n${USAGE}`)
	}
	return options
}

function main(argv) {
	try {
		const options = parseArgs(argv)
		if (!options.report) {
			console.error(USAGE)
			return 2
		}
		process.stdout.write(`${JSON.stringify(editorBundleReport({ webDir: options.webDir }), null, '\t')}\n`)
		return 0
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
