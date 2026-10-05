import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WORKSPACE_MANIFESTS = ['package.json', 'app/web/package.json', 'app/server/package.json']
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

const FLOORS = [
	{ name: 'next', floor: '16.3.6', ids: 'DEP-01' },
	{ name: '@next/mdx', floor: '16.3.6', ids: 'DEP-01' },
	{ name: 'multer', floor: '2.4.0', ids: 'DEP-01' },
	{ name: 'sharp', floor: '0.35.0', ids: 'DEP-01' },
	{ name: 'drizzle-orm', floor: '0.45.3', ids: 'DEP-01' },
	{ name: 'postcss', floor: '8.5.18', ids: 'DEP-01' },
	{ name: 'lodash', floor: '4.18.1', ids: 'DEP-02' },
]

const REMOVED = [/^tinymce$/, /^@tinymce\//, /^tinymce-/]

function parseVersion(text) {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text)
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function compareVersions(left, right) {
	const a = parseVersion(left)
	const b = parseVersion(right)
	assert.ok(a && b, `не версия: ${left} или ${right}`)
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
	return 0
}

function lockedVersions(lockText) {
	const found = new Map()
	let headers = null
	for (const line of lockText.split('\n')) {
		if (line === '' || line.startsWith('#')) continue
		if (!line.startsWith(' ')) {
			headers = line.endsWith(':')
				? line
						.slice(0, -1)
						.split(',')
						.map((part) => part.trim().replace(/^"|"$/g, ''))
				: null
			continue
		}
		const version = /^ {2}version: (\S+)$/.exec(line)
		if (!version || !headers) continue
		for (const header of headers) {
			const name = /^(@?[^@]+)@/.exec(header)?.[1]
			if (!name || header.includes('@workspace:')) continue
			if (!found.has(name)) found.set(name, new Set())
			found.get(name).add(version[1])
		}
		headers = null
	}
	return found
}

function floorViolations(versions, floors) {
	const problems = []
	for (const { name, floor } of floors) {
		const set = versions.get(name)
		if (!set || set.size === 0) {
			problems.push(`${name}: нет в yarn.lock`)
			continue
		}
		for (const version of set) {
			if (compareVersions(version, floor) < 0) problems.push(`${name}@${version} ниже ${floor}`)
		}
	}
	return problems
}

function removedViolations(versions) {
	return [...versions.keys()].filter((name) => REMOVED.some((pattern) => pattern.test(name)))
}

function manifestRangeProblems(manifest, floors) {
	const problems = []
	for (const field of DEPENDENCY_FIELDS) {
		for (const [name, range] of Object.entries(manifest[field] ?? {})) {
			const floor = floors.find((item) => item.name === name)
			if (!floor) continue
			const lower = /^[\^~>=\s]*(\d+\.\d+\.\d+)/.exec(range)?.[1]
			if (!lower) problems.push(`${field}.${name}: диапазон ${range} без нижней границы`)
			else if (compareVersions(lower, floor.floor) < 0) problems.push(`${field}.${name}: ${range} ниже ${floor.floor}`)
		}
		for (const name of Object.keys(manifest[field] ?? {})) {
			if (REMOVED.some((pattern) => pattern.test(name))) problems.push(`${field}.${name}: удалённый пакет`)
		}
	}
	return problems
}

const lock = fs.readFileSync(path.join(REPO_ROOT, 'yarn.lock'), 'utf8')
const versions = lockedVersions(lock)

test('сравнение версий и разбор yarn.lock ловят версию ниже порога (проба-нарушение)', () => {
	assert.equal(compareVersions('16.3.5', '16.3.6'), -1)
	assert.equal(compareVersions('16.10.0', '16.3.6'), 1)
	assert.equal(compareVersions('0.35.5', '0.35.0'), 1)
	const sample = [
		'"next@npm:^16.3.0":',
		'  version: 16.3.5',
		'  resolution: "next@npm:16.3.5"',
		'',
		'"postcss@npm:^8.4.41, postcss@npm:^8.5.28":',
		'  version: 8.5.28',
		'',
		'"postcss@npm:8.5.10":',
		'  version: 8.5.10',
		'',
		'"@next/mdx@npm:^16.3.8":',
		'  version: 16.3.8',
		'',
		'"tinymce@npm:^7.0.0":',
		'  version: 7.0.0',
	].join('\n')
	const parsed = lockedVersions(sample)
	assert.deepEqual([...parsed.get('postcss')].sort(), ['8.5.10', '8.5.28'])
	assert.deepEqual([...parsed.get('@next/mdx')], ['16.3.8'])
	const problems = floorViolations(parsed, FLOORS)
	assert.ok(problems.includes('next@16.3.5 ниже 16.3.6'), problems.join('\n'))
	assert.ok(problems.includes('postcss@8.5.10 ниже 8.5.18'), problems.join('\n'))
	assert.ok(problems.includes('multer: нет в yarn.lock'), problems.join('\n'))
	assert.deepEqual(removedViolations(parsed), ['tinymce'])
	const manifestProblems = manifestRangeProblems(
		{ dependencies: { lodash: '^4.17.21', multer: '^2.4.0', tinymce: '^7.0.0' } },
		FLOORS
	)
	assert.deepEqual(manifestProblems, [
		'dependencies.lodash: ^4.17.21 ниже 4.18.1',
		'dependencies.tinymce: удалённый пакет',
	])
})

test('yarn.lock: исправленные пакеты не ниже порогов, все записи пакета (DEP-01, DEP-02)', () => {
	assert.ok(versions.size > 500, `разобрано пакетов: ${versions.size}`)
	assert.deepEqual(floorViolations(versions, FLOORS), [])
})

test('yarn.lock: TinyMCE отсутствует (DEP-01)', () => {
	assert.deepEqual(removedViolations(versions), [])
})

test('package.json воркспейсов: диапазоны не ниже порогов, TinyMCE не заявлен', () => {
	for (const file of WORKSPACE_MANIFESTS) {
		const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
		assert.deepEqual(manifestRangeProblems(manifest, FLOORS), [], file)
	}
})

test('next и @next/mdx стоят на одной версии', () => {
	const next = [...versions.get('next')]
	const mdx = [...versions.get('@next/mdx')]
	assert.equal(next.length, 1, next.join(', '))
	assert.deepEqual(mdx, next)
})

test('multer остаётся на ветке 2.x', () => {
	for (const version of versions.get('multer')) assert.equal(parseVersion(version)[0], 2, `multer@${version}`)
})
