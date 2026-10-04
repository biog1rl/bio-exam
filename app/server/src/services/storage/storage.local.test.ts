import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { createLocalAdapter } from './adapters/local.js'
import type { StorageAdapter } from './port.js'

const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

const KEY_ERROR = (error: unknown) => error instanceof Error && error.name === 'StorageKeyError'
const CONFIG_ERROR = (error: unknown) => error instanceof Error && error.name === 'StorageConfigError'

let base = ''
let root = ''
let evil = ''
let outside = ''
let adapter: StorageAdapter

function snapshot(dir: string): string[] {
	const result: string[] = []
	const walk = (current: string, prefix: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name
			if (entry.isDirectory()) walk(path.join(current, entry.name), rel)
			else result.push(rel)
		}
	}
	walk(dir, '')
	return result.sort()
}

async function writeText(key: string, text: string): Promise<void> {
	await adapter.write(key, text, { contentType: 'text/markdown' })
}

async function readText(key: string): Promise<string | null> {
	const result = await adapter.read(key)
	return result === null ? null : result.data.toString('utf8')
}

beforeAll(() => {
	base = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-storage-'))
	root = path.join(base, 'data')
	evil = path.join(base, 'data-evil')
	outside = path.join(base, 'outside')
})

beforeEach(() => {
	createClientSpy.mockReset()
	for (const dir of [root, evil, outside]) {
		fs.rmSync(dir, { recursive: true, force: true })
		fs.mkdirSync(dir, { recursive: true })
	}
	adapter = createLocalAdapter({ root })
})

afterEach(() => {
	vi.unstubAllEnvs()
})

afterAll(() => {
	fs.rmSync(base, { recursive: true, force: true })
})

describe('local adapter: configuration', () => {
	test('createLocalAdapter refuses a relative root', () => {
		assert.throws(() => createLocalAdapter({ root: 'relative/dir' }), /STORAGE_LOCAL_DIR must be an absolute path/)
	})

	test('a relative STORAGE_LOCAL_DIR is a StorageConfigError', async () => {
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', 'relative/dir')
		const { resolveStorageDriver } = await import('./index.js')
		assert.throws(
			() => resolveStorageDriver(),
			(error: unknown) => CONFIG_ERROR(error) && /STORAGE_LOCAL_DIR must be an absolute path/.test(String(error))
		)
	})

	test('an empty STORAGE_LOCAL_DIR is a StorageConfigError', async () => {
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', '')
		const { resolveStorageDriver } = await import('./index.js')
		assert.throws(
			() => resolveStorageDriver(),
			(error: unknown) => CONFIG_ERROR(error) && /STORAGE_LOCAL_DIR must be an absolute path/.test(String(error))
		)
	})
})

describe('local adapter: files on disk', () => {
	test('a directory reads as null and does not exist as an object', async () => {
		await writeText('topics/t/a.md', 'a')
		assert.equal(await adapter.read('topics/t'), null)
		assert.equal(await adapter.exists('topics/t'), false)
		assert.equal(await adapter.exists('topics/t/a.md'), true)
	})

	test('the content type follows the extension, not the written type', async () => {
		const cases: Array<[string, string]> = [
			['f.png', 'image/png'],
			['f.PNG', 'image/png'],
			['f.jpg', 'image/jpeg'],
			['f.jpeg', 'image/jpeg'],
			['f.gif', 'image/gif'],
			['f.webp', 'image/webp'],
			['f.svg', 'image/svg+xml'],
			['f.md', 'text/markdown'],
			['f.json', 'application/json'],
			['f.txt', 'text/plain'],
			['f.zip', 'application/zip'],
			['f.unknown', 'application/octet-stream'],
			['noext', 'application/octet-stream'],
		]
		for (const [name, expected] of cases) {
			await adapter.write(`topics/ct/${name}`, Buffer.from('x'), { contentType: 'application/octet-stream' })
			assert.equal((await adapter.read(`topics/ct/${name}`))?.contentType, expected, name)
		}
	})

	test('an overwrite is atomic and leaves no temporary files behind', async () => {
		await writeText('topics/a/f.md', 'one')
		await writeText('topics/a/f.md', 'two')
		await adapter.copy('topics/a/f.md', 'topics/a/g.md')
		assert.equal(await readText('topics/a/f.md'), 'two')
		assert.deepEqual(fs.readdirSync(path.join(root, 'topics', 'a')).sort(), ['f.md', 'g.md'])
	})

	test('a failed write cleans up its temporary file', async () => {
		fs.mkdirSync(path.join(root, 'topics', 'a', 'dir'), { recursive: true })
		await assert.rejects(() => writeText('topics/a/dir', 'x'))
		assert.deepEqual(fs.readdirSync(path.join(root, 'topics', 'a')), ['dir'])
	})

	test('a leftover temporary file is not listed', async () => {
		await writeText('topics/tmp/f.md', 'f')
		fs.writeFileSync(path.join(root, 'topics', 'tmp', 'f.md.tmp-0123456789ab'), 'partial')
		assert.deepEqual(
			(await adapter.list('topics/tmp', { recursive: true })).map((object) => object.key),
			['topics/tmp/f.md']
		)
	})

	test('remove prunes empty parent directories and keeps the root and non-empty siblings', async () => {
		await writeText('topics/a/t1/q/1.md', '1')
		await writeText('topics/a/t2/keep.md', 'keep')
		await adapter.remove(['topics/a/t1/q/1.md'])
		assert.equal(fs.existsSync(path.join(root, 'topics', 'a', 't1')), false)
		assert.equal(fs.existsSync(path.join(root, 'topics', 'a', 't2', 'keep.md')), true)
		await adapter.remove(['topics/a/t2/keep.md'])
		assert.equal(fs.existsSync(path.join(root, 'topics')), false)
		assert.equal(fs.existsSync(root), true)
	})

	test('listings do not expose or follow symlinks', async () => {
		await writeText('topics/l/a.md', 'a')
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.symlinkSync(outside, path.join(root, 'topics', 'l', 'link'))
		fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'topics', 'l', 'filelink.md'))
		assert.deepEqual(
			(await adapter.list('topics/l', { recursive: true })).map((object) => object.key),
			['topics/l/a.md']
		)
	})
})

describe('local adapter: containment', () => {
	const escapingKeys: Array<{ name: string; key: string }> = [
		{ name: 'parent segment', key: '../x' },
		{ name: 'nested parent segment', key: 'a/../../x' },
		{ name: 'parent segment that stays inside after normalize', key: 'a/../b' },
		{ name: 'into the sibling-prefix directory', key: '../data-evil/x' },
		{ name: 'absolute posix path', key: '/etc/passwd' },
		{ name: 'windows drive path', key: 'C:\\x' },
		{ name: 'windows drive path with slash', key: 'C:/x' },
		{ name: 'unc path', key: '\\\\server\\x' },
		{ name: 'backslash separator', key: 'a\\b' },
		{ name: 'empty key', key: '' },
		{ name: 'NUL byte', key: 'a\u0000b' },
		{ name: 'dot only', key: '.' },
		{ name: 'dot segments only', key: './' },
	]

	test.each(escapingKeys)('the adapter itself rejects $name', async ({ key }) => {
		await writeText('topics/ok.md', 'ok')
		const before = snapshot(base)

		await assert.rejects(() => adapter.write(key, 'x', { contentType: 'text/plain' }), KEY_ERROR)
		await assert.rejects(() => adapter.read(key), KEY_ERROR)
		await assert.rejects(() => adapter.exists(key), KEY_ERROR)
		await assert.rejects(() => adapter.remove([key]), KEY_ERROR)
		await assert.rejects(() => adapter.copy(key, 'topics/copied.md'), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/ok.md', key), KEY_ERROR)
		await assert.rejects(() => adapter.list(key, { recursive: true }), KEY_ERROR)

		assert.deepEqual(snapshot(base), before)
	})

	test('the rejection message does not echo absolute host paths', async () => {
		await assert.rejects(
			() => adapter.read('../x'),
			(error: Error) => !error.message.includes(base) && !error.message.includes(root)
		)
	})

	test('a directory symlink pointing outside blocks every operation through it', async () => {
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		await writeText('topics/inside.md', 'inside')
		fs.symlinkSync(outside, path.join(root, 'topics', 'link'))

		await assert.rejects(() => writeText('topics/link/new.md', 'x'), KEY_ERROR)
		await assert.rejects(() => writeText('topics/link/deep/new.md', 'x'), KEY_ERROR)
		await assert.rejects(() => adapter.read('topics/link/secret.md'), KEY_ERROR)
		await assert.rejects(() => adapter.exists('topics/link/secret.md'), KEY_ERROR)
		await assert.rejects(() => adapter.remove(['topics/link/secret.md']), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/link/secret.md', 'topics/stolen.md'), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/inside.md', 'topics/link/planted.md'), KEY_ERROR)
		await assert.rejects(() => adapter.list('topics/link', { recursive: true }), KEY_ERROR)

		assert.deepEqual(snapshot(outside), ['secret.md'])
		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
		assert.equal(fs.existsSync(path.join(root, 'topics', 'stolen.md')), false)
	})

	test('a file symlink pointing outside blocks reads, overwrites, removal and copies', async () => {
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		await writeText('topics/inside.md', 'inside')
		fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'topics', 'filelink.md'))

		await assert.rejects(() => adapter.read('topics/filelink.md'), KEY_ERROR)
		await assert.rejects(() => writeText('topics/filelink.md', 'overwritten'), KEY_ERROR)
		await assert.rejects(() => adapter.remove(['topics/filelink.md']), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/filelink.md', 'topics/stolen.md'), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/inside.md', 'topics/filelink.md'), KEY_ERROR)

		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
		assert.equal(fs.existsSync(path.join(root, 'topics', 'stolen.md')), false)
	})

	test('a dangling symlink pointing outside blocks writes and copies onto it', async () => {
		await writeText('topics/inside.md', 'inside')
		fs.symlinkSync(path.join(outside, 'not-yet'), path.join(root, 'topics', 'dangling'))

		await assert.rejects(() => writeText('topics/dangling/x.md', 'x'), KEY_ERROR)
		await assert.rejects(() => writeText('topics/dangling', 'x'), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/inside.md', 'topics/dangling'), KEY_ERROR)
		await assert.rejects(() => adapter.copy('topics/inside.md', 'topics/dangling/x.md'), KEY_ERROR)
		assert.deepEqual(snapshot(outside), [])
	})

	test('sibling-prefix trap: no key reaches the directory that shares the root prefix', async () => {
		fs.mkdirSync(path.join(root, 'topics'), { recursive: true })
		fs.symlinkSync(evil, path.join(root, 'topics', 'sib'))

		await assert.rejects(() => writeText('topics/sib/x', 'x'), KEY_ERROR)
		await assert.rejects(() => writeText('../data-evil/x', 'x'), KEY_ERROR)
		assert.deepEqual(snapshot(evil), [])
	})

	test('a symlink that stays inside the root is allowed', async () => {
		await writeText('topics/real/a.md', 'a')
		fs.symlinkSync(path.join(root, 'topics', 'real'), path.join(root, 'topics', 'alias'))
		assert.equal(await readText('topics/alias/a.md'), 'a')
		await writeText('topics/alias/b.md', 'b')
		assert.equal(fs.readFileSync(path.join(root, 'topics', 'real', 'b.md'), 'utf8'), 'b')
	})
})

describe('driver selection keeps the Supabase client out', () => {
	beforeEach(() => {
		vi.resetModules()
		vi.stubEnv('STORAGE_DRIVER', undefined)
		vi.stubEnv('STORAGE_LOCAL_DIR', undefined)
		vi.stubEnv('SUPABASE_URL', 'https://fake-project.invalid')
		vi.stubEnv('SUPABASE_SERVICE_KEY', 'fake-service-key')
	})

	test('STORAGE_DRIVER=local in an isolated process works on disk and never creates a client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { resolveStorageDriver, storage } = await import('./index.js')

		assert.equal(resolveStorageDriver(), 'local')
		await storage().write('topics/p/a.md', 'prompt', { contentType: 'text/markdown' })
		assert.equal(await storage().readText('topics/p/a.md'), 'prompt')
		assert.equal(fs.readFileSync(path.join(root, 'topics', 'p', 'a.md'), 'utf8'), 'prompt')
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('STORAGE_DRIVER=local outside isolation takes precedence over SUPABASE_* and never creates a client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { resolveStorageDriver, storage } = await import('./index.js')

		assert.equal(resolveStorageDriver(), 'local')
		await storage().write('topics/p/a.md', 'local wins', { contentType: 'text/markdown' })
		assert.equal(await storage().readText('topics/p/a.md'), 'local wins')
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('an isolated process without a driver gets the in-memory adapter and no client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		const { resolveStorageDriver, storage } = await import('./index.js')

		assert.equal(resolveStorageDriver(), 'memory')
		assert.equal(storage().kind, 'memory')
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('an isolated process refuses STORAGE_DRIVER=supabase with a configuration error and no client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('STORAGE_DRIVER', 'supabase')
		const { storage } = await import('./index.js')

		assert.throws(() => storage(), CONFIG_ERROR)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('without any configuration outside isolation the module fails with a configuration error and no client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		const { storage } = await import('./index.js')

		assert.throws(() => storage(), CONFIG_ERROR)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})
})
