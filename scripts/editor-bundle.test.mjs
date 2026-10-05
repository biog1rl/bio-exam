import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

import { EDITOR_ROUTES, EMOJI_MARKER } from './editor-bundle.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('./editor-bundle.mjs', import.meta.url))
const STATS_RELATIVE = path.join('.next', 'diagnostics', 'route-bundle-stats.json')

const CHUNKS = {
	'.next/static/chunks/core.js': `function core(){return ${JSON.stringify('x'.repeat(4000))}}`,
	'.next/static/chunks/emoji.js': `var list=[{description:${JSON.stringify(EMOJI_MARKER)},emoji:"x"}]`,
	'.next/static/chunks/page.js': 'export default function Page(){return null}',
}

function makeWebDir(t, { stats, chunks = CHUNKS } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-bundle-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	for (const [relative, text] of Object.entries(chunks)) {
		const full = path.join(dir, relative)
		fs.mkdirSync(path.dirname(full), { recursive: true })
		fs.writeFileSync(full, text)
	}
	if (stats !== undefined) {
		const full = path.join(dir, STATS_RELATIVE)
		fs.mkdirSync(path.dirname(full), { recursive: true })
		fs.writeFileSync(full, JSON.stringify(stats))
	}
	return dir
}

function routeEntry(route, chunkPaths) {
	return { route, firstLoadUncompressedJsBytes: 1, firstLoadChunkPaths: chunkPaths }
}

function run(args) {
	return spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' })
}

function sizeOf(relatives, transform) {
	return relatives.reduce((sum, relative) => sum + transform(Buffer.from(CHUNKS[relative])).length, 0)
}

test('--report prints raw and gzip first-load sizes and the emoji-list flag for both editor routes', (t) => {
	const [questionRoute, draftRoute] = EDITOR_ROUTES
	const withEmoji = ['.next/static/chunks/core.js', '.next/static/chunks/emoji.js', '.next/static/chunks/page.js']
	const withoutEmoji = ['.next/static/chunks/core.js', '.next/static/chunks/page.js']
	const dir = makeWebDir(t, {
		stats: [
			routeEntry('/', ['.next/static/chunks/page.js']),
			routeEntry(questionRoute, withEmoji),
			routeEntry(draftRoute, withoutEmoji),
		],
	})

	const result = run(['--report', '--web-dir', dir])
	assert.equal(result.status, 0, result.stderr)
	const report = JSON.parse(result.stdout)
	assert.equal(report.marker, EMOJI_MARKER)
	assert.deepEqual(
		report.routes.map((item) => item.route),
		[questionRoute, draftRoute]
	)

	const [question, draft] = report.routes
	assert.equal(
		question.firstLoadRawBytes,
		sizeOf(withEmoji, (buffer) => buffer)
	)
	assert.equal(
		question.firstLoadGzipBytes,
		sizeOf(withEmoji, (buffer) => zlib.gzipSync(buffer))
	)
	assert.equal(question.firstLoadChunks, 3)
	assert.equal(question.emojiInFirstLoad, true)
	assert.deepEqual(question.emojiChunks, ['.next/static/chunks/emoji.js'])

	assert.equal(
		draft.firstLoadRawBytes,
		sizeOf(withoutEmoji, (buffer) => buffer)
	)
	assert.equal(
		draft.firstLoadGzipBytes,
		sizeOf(withoutEmoji, (buffer) => zlib.gzipSync(buffer))
	)
	assert.equal(draft.emojiInFirstLoad, false)
	assert.deepEqual(draft.emojiChunks, [])
})

test('missing route-bundle-stats.json exits 1 and names the path', (t) => {
	const dir = makeWebDir(t)
	const result = run(['--report', '--web-dir', dir])
	assert.equal(result.status, 1)
	assert.match(result.stderr, /route-bundle-stats\.json/)
	assert.ok(result.stderr.includes(dir), result.stderr)
})

test('missing editor route exits 1 and names the route and the stats path', (t) => {
	const [questionRoute, draftRoute] = EDITOR_ROUTES
	const dir = makeWebDir(t, { stats: [routeEntry(questionRoute, ['.next/static/chunks/page.js'])] })
	const result = run(['--report', '--web-dir', dir])
	assert.equal(result.status, 1)
	assert.ok(result.stderr.includes(draftRoute), result.stderr)
	assert.match(result.stderr, /route-bundle-stats\.json/)
})

test('missing first-load chunk file exits 1 and names the chunk', (t) => {
	const [questionRoute, draftRoute] = EDITOR_ROUTES
	const dir = makeWebDir(t, {
		stats: [
			routeEntry(questionRoute, ['.next/static/chunks/page.js']),
			routeEntry(draftRoute, ['.next/static/chunks/gone.js']),
		],
	})
	const result = run(['--report', '--web-dir', dir])
	assert.equal(result.status, 1)
	assert.match(result.stderr, /gone\.js/)
})

test('without a mode the script prints usage and exits non-zero', () => {
	const result = run([])
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /usage/)
})
