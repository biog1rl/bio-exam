const cp = require('child_process')
const fs = require('fs')
const crypto = require('crypto')

const PHASE_DIR = '.planning/phases/10-notification-journal-and-bell/'
const SPEC = ['app', 'packages', 'scripts', 'e2e', '.agents', '.github', 'AGENTS.md', 'docs', 'package.json']

function fingerprint() {
	const out = cp
		.execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...SPEC])
		.toString()
		.split('\0')
		.filter(Boolean)
	const map = {}
	for (let i = 0; i < out.length; i++) {
		const entry = out[i]
		const file = entry.slice(3)
		if (/^[RC]/.test(entry)) i++
		map[file] = fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'deleted'
	}
	return map
}

function planMeta(fileName) {
	const head = fs.readFileSync(PHASE_DIR + fileName, 'utf8').split('\n---')[0]
	const wave = (head.match(/^wave:\s*(\d+)/m) || [])[1]
	const files = []
	const optional = new Set()
	let inList = false
	for (const line of head.split('\n')) {
		if (/^files_modified:/.test(line)) {
			inList = true
			continue
		}
		if (inList && /^\s+-\s/.test(line)) {
			const raw = line.replace(/^\s+-\s+/, '')
			const file = raw.replace(/\s+#.*$/, '').trim()
			files.push(file)
			if (/#\s*optional/.test(raw)) optional.add(file)
			continue
		}
		if (inList && /^\S/.test(line)) inList = false
	}
	return { wave, files, optional }
}

function covers(entry, file) {
	if (entry.endsWith('/**')) return file.startsWith(entry.slice(0, -2))
	return entry === file
}

const [command, id] = process.argv.slice(2)
if (!command || !/^10-\d\d$/.test(id || '')) {
	console.error('usage: node ' + PHASE_DIR + '10-plan-files.cjs snapshot|check 10-NN')
	process.exit(64)
}
const snapshotDir = '.planning/commit-snapshots/before-' + id

if (command === 'snapshot') {
	const map = fingerprint()
	fs.mkdirSync(snapshotDir, { recursive: true })
	fs.writeFileSync(snapshotDir + '/fingerprint.json', JSON.stringify(map, null, 1))
	console.log('fingerprint', id, Object.keys(map).length, 'paths')
	process.exit(0)
}

if (command === 'check') {
	const own = planMeta(id + '-PLAN.md')
	const siblings = []
	for (const name of fs.readdirSync(PHASE_DIR)) {
		if (!/^10-\d\d-PLAN\.md$/.test(name) || name === id + '-PLAN.md') continue
		const meta = planMeta(name)
		if (meta.wave === own.wave) siblings.push(...meta.files)
	}
	const before = JSON.parse(fs.readFileSync(snapshotDir + '/fingerprint.json', 'utf8'))
	const now = fingerprint()
	const changed = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((file) => before[file] !== now[file])
	const outside = changed.filter((file) => !own.files.some((entry) => covers(entry, file)) && !siblings.some((entry) => covers(entry, file)))
	if (outside.length) {
		console.error('outside plan:\n' + outside.join('\n'))
		process.exit(1)
	}
	const missing = own.files.filter((entry) => !own.optional.has(entry) && !changed.some((file) => covers(entry, file)))
	if (missing.length) {
		console.error('not changed:\n' + missing.join('\n'))
		process.exit(2)
	}
	console.log(id, 'changed only its files')
	process.exit(0)
}

console.error('unknown command ' + command)
process.exit(64)
