/**
 * Тесты проверки контракта окружения (VER-06): фикстуры-воркспейсы создаются во временных
 * каталогах внутри теста, настоящие .env не читаются и не создаются в репозитории.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkEnvContract, collectUsedKeys, isPlaceholder, isUnsafeValue, parseExample } from './check-env-contract.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('./check-env-contract.mjs', import.meta.url))

/** Создаёт временный воркспейс; каталог удаляется после теста */
function makeWorkspace(t, { name = 'ws', files = {}, example, sources = ['src'], zodFile } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-contract-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	for (const [relative, text] of Object.entries(files)) {
		const full = path.join(dir, relative)
		fs.mkdirSync(path.dirname(full), { recursive: true })
		fs.writeFileSync(full, text)
	}
	if (example !== undefined) fs.writeFileSync(path.join(dir, '.env.example'), example)
	return { name, dir, sources, ...(zodFile ? { zodFile } : {}) }
}

function messages(workspaces, allowlist = {}) {
	return checkEnvContract({ workspaces, config: { allowlist } }).map((finding) => finding.message)
}

test('used keys documented as uncommented empty value and commented value: passes', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'const a = process.env.A\nconst b = process.env["B"]\n' },
		example: '# --- Общее ---\nA=\n# B=\n',
	})
	assert.deepEqual(messages([ws]), [])
})

test('used key missing from the example is undocumented', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.A\nprocess.env.C\n' },
		example: 'A=\n',
	})
	assert.deepEqual(messages([ws]), ['ws: undocumented: C'])
})

test('documented key that code never reads is unused', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.A\n' },
		example: 'A=\n# D=\n',
	})
	assert.deepEqual(messages([ws]), ['ws: unused: D'])
})

test('allowlisted key is exempt from both rules (read through a parameter, or platform-provided)', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.A\nprocess.env.PLATFORM\n' },
		example: 'A=\n# G=\n',
	})
	const allowlist = {
		ws: [
			{ key: 'G', reason: 'читается через параметр, а не process.env.G' },
			{ key: 'PLATFORM', reason: 'задаётся платформой' },
		],
	}
	assert.deepEqual(messages([ws], allowlist), [])
})

test('allowlist entry without a reason is a finding', (t) => {
	const ws = makeWorkspace(t, { files: { 'src/a.ts': 'process.env.A\n' }, example: 'A=\n' })
	assert.deepEqual(messages([ws], { ws: [{ key: 'A', reason: '  ' }] }), ['ws: allowlist entry without a reason: A'])
})

test('unsafe values are rejected, commented or not, and never echoed', (t) => {
	const jwt = 'eyJhbGciOiJIUzI1NiJ9.x.y'
	const host = 'postgresql://u:p@aws-1-x.pooler.supabase.com:6543/postgres'
	const random = 'Zk3pQ9vL2mXc8RtYh5NwB7dJf1GsAe4U6oIq0Vb'
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.SECRET\nprocess.env.URL\nprocess.env.RAND\nprocess.env.KEYY\n' },
		example: `SECRET=${jwt}\nURL=${host}\n# RAND=${random}\nKEYY=sb_publishable_x\n`,
	})
	const result = messages([ws])
	assert.deepEqual(result, [
		'ws: unsafe value: KEYY',
		'ws: unsafe value: RAND',
		'ws: unsafe value: SECRET',
		'ws: unsafe value: URL',
	])
	for (const message of result) {
		assert.ok(!message.includes(jwt) && !message.includes(random) && !message.includes('pooler'))
	}
})

test('uncommented value that is not a placeholder is rejected', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.NAME\nprocess.env.GOOD\n' },
		example: 'NAME=my_real_value\nGOOD=\n',
	})
	assert.deepEqual(messages([ws]), ['ws: not a placeholder: NAME'])
})

test('a key present both commented and uncommented is a duplicate, reported once', (t) => {
	const ws = makeWorkspace(t, {
		files: { 'src/a.ts': 'process.env.E\n' },
		example: 'E=\n# E=\nE=1\n',
	})
	assert.deepEqual(messages([ws]), ['ws: duplicate: E'])
})

test('missing example file and example without keys fail', (t) => {
	const missing = makeWorkspace(t, { name: 'a-missing', files: { 'src/a.ts': 'process.env.A\n' } })
	const empty = makeWorkspace(t, {
		name: 'b-empty',
		files: { 'src/a.ts': 'process.env.A\n' },
		example: '# --- Общее ---\n# только пояснения\n',
	})
	const result = messages([missing, empty])
	assert.equal(result.filter((message) => message.startsWith('a-missing:')).length > 0, true)
	assert.ok(result.some((message) => message === 'a-missing: missing example file'))
	assert.ok(result.some((message) => message === 'b-empty: example has no keys'))
})

test('missing source root fails closed', (t) => {
	const ws = makeWorkspace(t, { files: {}, example: 'A=\n', sources: ['src'] })
	assert.deepEqual(messages([ws]), ['ws: missing source: src', 'ws: unused: A'])
})

test('findings are sorted by workspace then key and identical between runs', (t) => {
	const b = makeWorkspace(t, { name: 'b', files: { 'src/a.ts': 'process.env.Z\nprocess.env.M\n' }, example: 'Q=\n' })
	const a = makeWorkspace(t, { name: 'a', files: { 'src/a.ts': 'process.env.Y\n' }, example: 'X=\n' })
	const first = messages([b, a])
	assert.deepEqual(first, [
		'a: unused: X',
		'a: undocumented: Y',
		'b: undocumented: M',
		'b: unused: Q',
		'b: undocumented: Z',
	])
	assert.deepEqual(messages([a, b]), first)
	assert.deepEqual(messages([b, a]), first)
})

test('zod schema keys count as used; a required key must not be commented', (t) => {
	const ws = makeWorkspace(t, {
		files: {
			'lib/env.ts': [
				"import 'server-only'",
				'const schema = z.object({',
				'	DATABASE_URL: z.string(),',
				'	OPT: z.string().optional(),',
				'})',
			].join('\n'),
		},
		sources: [],
		zodFile: 'lib/env.ts',
		example: '# DATABASE_URL=\n# OPT=\n',
	})
	assert.deepEqual(messages([ws]), ['ws: required key is commented: DATABASE_URL'])
	const ok = makeWorkspace(t, {
		files: { 'lib/env.ts': 'z.object({\n\tDATABASE_URL: z.string(),\n\tOPT: z.string().optional(),\n})\n' },
		sources: [],
		zodFile: 'lib/env.ts',
		example: 'DATABASE_URL=postgresql://\n# OPT=\n',
	})
	assert.deepEqual(messages([ok]), [])
})

test('collector skips node_modules, .next and dist, and non-source files', (t) => {
	const ws = makeWorkspace(t, {
		files: {
			'src/a.ts': 'process.env.A\n',
			'src/node_modules/x/index.js': 'process.env.HIDDEN_ONE\n',
			'src/.next/y.js': 'process.env.HIDDEN_TWO\n',
			'src/dist/z.js': 'process.env.HIDDEN_THREE\n',
			'src/notes.md': 'process.env.HIDDEN_FOUR\n',
		},
		example: 'A=\n',
	})
	assert.deepEqual(messages([ws]), [])
	assert.deepEqual([...collectUsedKeys(ws.dir, ws.sources).errors], [])
})

test('real .env files in a workspace are never read', (t) => {
	const ws = makeWorkspace(t, {
		files: {
			'src/a.ts': 'process.env.A\n',
			'.env': 'A=eyJhbGciOiJIUzI1NiJ9.x.y\nEXTRA=sb_secret_value\n',
		},
		example: 'A=\n',
	})
	assert.deepEqual(messages([ws]), [])
})

test('the check script contains no literal path to a real env file', () => {
	const source = fs.readFileSync(SCRIPT_PATH, 'utf8')
	assert.doesNotMatch(source, /['"]\.env['"]|\/\.env['"]/)
})

test('parseExample: keys, comment flag, prose ignored', () => {
	const entries = parseExample('# Пояснение без ключа\nA=1\n# B=x\n  # C=\nlowercase=1\n')
	assert.deepEqual(
		entries.map(({ key, commented, value }) => [key, commented, value]),
		[
			['A', false, '1'],
			['B', true, 'x'],
			['C', true, ''],
		]
	)
})

test('isPlaceholder and isUnsafeValue follow the contract', () => {
	for (const value of [
		'',
		'<секрет>',
		'change-me',
		'changeme-please',
		'example-value',
		'postgresql://',
		'postgres://',
		'http://localhost',
		'http://localhost:3000',
		'4000',
		'0',
		'true',
		'false',
		'development',
		'info',
		'debug',
	]) {
		assert.equal(isPlaceholder(value), true, value)
	}
	for (const value of ['admin', 'itsdoc_session', 'postgresql://u:p@db:5432/x', 'https://example.com', 'production']) {
		assert.equal(isPlaceholder(value), false, value)
	}
	assert.equal(isUnsafeValue('http://localhost:3000'), false)
	assert.equal(isUnsafeValue('postgresql://'), false)
	assert.equal(isUnsafeValue('change-me'), false)
	assert.equal(isUnsafeValue('eyJabc'), true)
	assert.equal(isUnsafeValue('sb_abc'), true)
	assert.equal(isUnsafeValue('x.supabase.co'), true)
	assert.equal(isUnsafeValue('x.supabase.com'), true)
	assert.equal(isUnsafeValue('a.pooler.b'), true)
	assert.equal(isUnsafeValue('Zk3pQ9vL2mXc8RtYh5NwB7dJf1GsAe4U'), true)
})
