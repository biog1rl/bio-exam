import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { StorageService } from './storage.js'

// Шпион на createClient: изолированный процесс не должен создавать клиент Supabase (D-17).
// Вынесен через vi.hoisted, чтобы переживать vi.resetModules() в тестах с динамическим импортом.
const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

// Локальный режим StorageService (D-18): все ключи живут внутри STORAGE_LOCAL_DIR.
// Тесты работают только с временным каталогом, без базы данных и без Supabase.

const ESCAPE_MESSAGE = /path escapes storage root|invalid storage key/

let base = ''
let root = ''
let evil = ''
let outside = ''

/** Все файлы под каталогом (относительные пути), для проверки, что за пределами корня ничего не изменилось */
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

beforeAll(() => {
	base = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-storage-'))
	root = path.join(base, 'data')
	evil = path.join(base, 'data-evil')
	outside = path.join(base, 'outside')
})

beforeEach(() => {
	createClientSpy.mockReset()
	createClientSpy.mockImplementation(() => ({
		storage: {
			from: () => ({
				download: async () => ({ data: null, error: new Error('fake supabase') }),
				upload: async () => ({ error: new Error('fake supabase') }),
			}),
		},
	}))
	for (const dir of [root, evil, outside]) {
		fs.rmSync(dir, { recursive: true, force: true })
		fs.mkdirSync(dir, { recursive: true })
	}
	vi.stubEnv('STORAGE_DRIVER', 'local')
	vi.stubEnv('STORAGE_LOCAL_DIR', root)
})

afterAll(() => {
	vi.unstubAllEnvs()
	fs.rmSync(base, { recursive: true, force: true })
})

describe('local mode: configuration', () => {
	test('relative STORAGE_LOCAL_DIR is rejected', async () => {
		vi.stubEnv('STORAGE_LOCAL_DIR', 'relative/dir')
		await assert.rejects(
			() => new StorageService().writeFile('a/b.md', 'x'),
			/STORAGE_LOCAL_DIR must be an absolute path/
		)
	})

	test('missing STORAGE_LOCAL_DIR is rejected', async () => {
		vi.stubEnv('STORAGE_LOCAL_DIR', '')
		await assert.rejects(() => new StorageService().readFile('a/b.md'), /STORAGE_LOCAL_DIR must be an absolute path/)
	})
})

describe('local mode: file operations', () => {
	test('writeFile then readFile round-trips text and creates parent directories', async () => {
		const storage = new StorageService()
		const key = 'topics/t/x/questions/q1/prompt.md'
		await storage.writeFile(key, 'Текст')
		assert.equal(await storage.readFile(key), 'Текст')
		assert.equal(fs.readFileSync(path.join(root, key), 'utf8'), 'Текст')
	})

	test('readFile of a missing key returns an empty string', async () => {
		assert.equal(await new StorageService().readFile('topics/none/prompt.md'), '')
	})

	test('readFile of a directory returns an empty string', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/a.md', 'a')
		assert.equal(await storage.readFile('topics/t'), '')
	})

	test('writeFile overwrites and leaves no temporary files behind', async () => {
		const storage = new StorageService()
		await storage.writeFile('a/f.md', 'one')
		await storage.writeFile('a/f.md', 'two')
		assert.equal(await storage.readFile('a/f.md'), 'two')
		assert.deepEqual(fs.readdirSync(path.join(root, 'a')), ['f.md'])
	})

	test('a failed write cleans up its temporary file', async () => {
		const storage = new StorageService()
		fs.mkdirSync(path.join(root, 'a', 'dir'), { recursive: true })
		await assert.rejects(() => storage.writeFile('a/dir', 'x'))
		assert.deepEqual(fs.readdirSync(path.join(root, 'a')), ['dir'])
	})

	test('writeJson and readJson round-trip an object, missing key gives null', async () => {
		const storage = new StorageService()
		const data = { a: 1, список: ['x', 'y'], nested: { ok: true } }
		await storage.writeJson('topics/t/settings.json', data)
		assert.deepEqual(await storage.readJson('topics/t/settings.json'), data)
		assert.equal(await storage.readJson('topics/t/missing.json'), null)
	})

	test('readJson of invalid JSON returns null', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/broken.json', '{not json')
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		assert.equal(await storage.readJson('topics/t/broken.json'), null)
		errorSpy.mockRestore()
	})

	test('uploadBuffer and downloadBuffer round-trip bytes', async () => {
		const storage = new StorageService()
		const bytes = Buffer.from([0, 1, 2, 250, 251, 252])
		await storage.uploadBuffer('images/pic.png', bytes, 'image/png')
		const downloaded = await storage.downloadBuffer('images/pic.png')
		assert.deepEqual(downloaded.buffer, bytes)
		assert.equal(downloaded.contentType, 'image/png')
	})

	test('uploadBuffer with upsert false refuses to overwrite', async () => {
		const storage = new StorageService()
		await storage.uploadBuffer('images/pic.png', Buffer.from('a'), 'image/png')
		await assert.rejects(
			() => storage.uploadBuffer('images/pic.png', Buffer.from('b'), 'image/png', { upsert: false }),
			/already exists/
		)
		assert.equal((await storage.downloadBuffer('images/pic.png')).buffer.toString(), 'a')
	})

	test('downloadBuffer content type follows the extension', async () => {
		const storage = new StorageService()
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
			await storage.uploadBuffer(`ct/${name}`, Buffer.from('x'), 'application/octet-stream')
			assert.equal((await storage.downloadBuffer(`ct/${name}`)).contentType, expected, name)
		}
	})

	test('downloadBuffer of a missing key rejects', async () => {
		await assert.rejects(() => new StorageService().downloadBuffer('images/none.png'), /not found/i)
	})

	test('readFilesParallel returns a Map with only the existing keys', async () => {
		const storage = new StorageService()
		await storage.writeFile('p/a.md', 'A')
		await storage.writeFile('p/b.md', 'B')
		const result = await storage.readFilesParallel(['p/a.md', 'p/missing.md', 'p/b.md'], 2)
		assert.deepEqual(
			[...result.entries()],
			[
				['p/a.md', 'A'],
				['p/b.md', 'B'],
			]
		)
		assert.equal((await storage.readFilesParallel([])).size, 0)
	})

	test('exists is true for files only', async () => {
		const storage = new StorageService()
		await storage.writeFile('e/a.md', 'A')
		assert.equal(await storage.exists('e/a.md'), true)
		assert.equal(await storage.exists('e/b.md'), false)
		assert.equal(await storage.exists('e'), false)
	})

	test('deleteFiles removes files and ignores missing keys', async () => {
		const storage = new StorageService()
		await storage.writeFile('d/a.md', 'A')
		await storage.writeFile('d/b.md', 'B')
		await storage.deleteFiles(['d/a.md', 'd/none.md'])
		assert.equal(await storage.exists('d/a.md'), false)
		assert.equal(await storage.exists('d/b.md'), true)
		await storage.deleteFiles([])
	})

	test('listFiles returns direct entries sorted by name', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/x/a.md', 'a')
		await storage.writeFile('topics/t/b.md', 'b')
		await storage.writeFile('topics/t/a.md', 'a')
		assert.deepEqual(await storage.listFiles('topics/t'), ['topics/t/a.md', 'topics/t/b.md', 'topics/t/x'])
		assert.deepEqual(await storage.listFiles('topics/none'), [])
	})

	test('listFiles of a lone subdirectory returns it as a direct entry', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/x/a.md', 'a')
		assert.deepEqual(await storage.listFiles('topics/t'), ['topics/t/x'])
	})

	test('listFilesRecursive returns full file keys, files only, sorted', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/b/z.md', 'z')
		await storage.writeFile('topics/a/q/2.md', '2')
		await storage.writeFile('topics/a/q/1.md', '1')
		await storage.writeFile('topics/a/top.md', 't')
		assert.deepEqual(await storage.listFilesRecursive('topics'), [
			'topics/a/q/1.md',
			'topics/a/q/2.md',
			'topics/a/top.md',
			'topics/b/z.md',
		])
		assert.deepEqual(await storage.listFilesRecursive('nothing'), [])
	})

	test('listings do not expose or follow symlinks', async () => {
		const storage = new StorageService()
		await storage.writeFile('l/a.md', 'a')
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.symlinkSync(outside, path.join(root, 'l', 'link'))
		assert.deepEqual(await storage.listFilesRecursive('l'), ['l/a.md'])
	})

	test('deleteDirectory removes a whole prefix and leaves siblings', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/a/t1/q/1.md', '1')
		await storage.writeFile('topics/a/t1/settings.json', '{}')
		await storage.writeFile('topics/a/t2/keep.md', 'keep')
		await storage.deleteDirectory('topics/a/t1')
		assert.deepEqual(await storage.listFilesRecursive('topics/a/t1'), [])
		assert.equal(fs.existsSync(path.join(root, 'topics', 'a', 't1')), false)
		assert.equal(await storage.exists('topics/a/t2/keep.md'), true)
		await storage.deleteDirectory('topics/a/never-existed')
	})

	test('getQuestionPath and getTestPath keep their shape', () => {
		const storage = new StorageService()
		assert.equal(storage.getQuestionPath('t', 'x', 'q1'), 'topics/t/x/questions/q1')
		assert.equal(storage.getTestPath('t', 'x'), 'topics/t/x')
	})
})

describe('local mode: containment', () => {
	const escapingKeys: Array<[string, string]> = [
		['parent segment', '../x'],
		['nested parent segment', 'a/../../x'],
		['parent segment that stays inside after normalize', 'a/../b'],
		['into the sibling-prefix directory', '../data-evil/x'],
		['absolute posix path', '/etc/passwd'],
		['windows drive path', 'C:\\x'],
		['windows drive path with slash', 'C:/x'],
		['unc path', '\\\\server\\x'],
		['backslash separator', 'a\\b'],
		['empty key', ''],
		['NUL byte', 'a\u0000b'],
		['dot only', '.'],
		['dot segments only', './'],
	]

	for (const [label, key] of escapingKeys) {
		test(`rejects ${label}: ${JSON.stringify(key)}`, async () => {
			const storage = new StorageService()
			const before = snapshot(base)

			await assert.rejects(() => storage.writeFile(key, 'x'), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.readFile(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.writeJson(key, {}), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.readJson(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.uploadBuffer(key, Buffer.from('x'), 'text/plain'), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.downloadBuffer(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.exists(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.deleteFiles([key]), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.listFiles(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.listFilesRecursive(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.deleteDirectory(key), ESCAPE_MESSAGE)
			await assert.rejects(() => storage.readFilesParallel(['ok.md', key]), ESCAPE_MESSAGE)

			assert.deepEqual(snapshot(base), before)
		})
	}

	test('the rejection message does not echo absolute host paths', async () => {
		const storage = new StorageService()
		await assert.rejects(
			() => storage.readFile('../x'),
			(error: Error) => !error.message.includes(base) && !error.message.includes(root)
		)
	})

	test('a literal %2e%2e segment is a plain directory name inside the root', async () => {
		const storage = new StorageService()
		await storage.writeFile('%2e%2e/x', 'literal')
		assert.equal(fs.readFileSync(path.join(root, '%2e%2e', 'x'), 'utf8'), 'literal')
		assert.equal(await storage.readFile('%2e%2e/x'), 'literal')
		assert.deepEqual(snapshot(evil), [])
		assert.deepEqual(snapshot(outside), [])
	})

	test('a directory symlink pointing outside blocks writeFile and readFile through it', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.symlinkSync(outside, path.join(root, 'link'))

		await assert.rejects(() => storage.writeFile('link/new.md', 'x'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.writeFile('link/deep/new.md', 'x'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.readFile('link/secret.md'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.deleteFiles(['link/secret.md']), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.exists('link/secret.md'), ESCAPE_MESSAGE)

		assert.deepEqual(snapshot(outside), ['secret.md'])
		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
	})

	test('a file symlink pointing outside blocks reads and overwrites', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'filelink.md'))

		await assert.rejects(() => storage.readFile('filelink.md'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.writeFile('filelink.md', 'overwritten'), ESCAPE_MESSAGE)
		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
	})

	test('a dangling symlink pointing outside blocks writes', async () => {
		const storage = new StorageService()
		fs.symlinkSync(path.join(outside, 'not-yet'), path.join(root, 'dangling'))

		await assert.rejects(() => storage.writeFile('dangling/x.md', 'x'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.writeFile('dangling', 'x'), ESCAPE_MESSAGE)
		assert.deepEqual(snapshot(outside), [])
	})

	test('sibling-prefix trap: no key reaches the directory that shares the root prefix', async () => {
		const storage = new StorageService()
		fs.symlinkSync(evil, path.join(root, 'sib'))

		await assert.rejects(() => storage.writeFile('sib/x', 'x'), ESCAPE_MESSAGE)
		await assert.rejects(() => storage.writeFile('../data-evil/x', 'x'), ESCAPE_MESSAGE)
		assert.deepEqual(snapshot(evil), [])
	})

	test('a symlink that stays inside the root is allowed', async () => {
		const storage = new StorageService()
		await storage.writeFile('real/a.md', 'a')
		fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'))
		assert.equal(await storage.readFile('alias/a.md'), 'a')
		await storage.writeFile('alias/b.md', 'b')
		assert.equal(fs.readFileSync(path.join(root, 'real', 'b.md'), 'utf8'), 'b')
	})
})

describe('local mode: moveDirectory', () => {
	test('moves every file under the prefix, keeps relative structure, empties the old prefix', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/a/t1/settings.json', '{}')
		await storage.writeFile('topics/a/t1/questions/q1/prompt.md', 'Q1')
		await storage.uploadBuffer('topics/a/t1/questions/q1/pic.png', Buffer.from([1, 2, 3]), 'image/png')
		await storage.writeFile('topics/a/other/keep.md', 'keep')

		await storage.moveDirectory('topics/a/t1', 'topics/a/t2')

		assert.deepEqual(await storage.listFilesRecursive('topics/a/t2'), [
			'topics/a/t2/questions/q1/pic.png',
			'topics/a/t2/questions/q1/prompt.md',
			'topics/a/t2/settings.json',
		])
		assert.equal(await storage.readFile('topics/a/t2/questions/q1/prompt.md'), 'Q1')
		assert.deepEqual((await storage.downloadBuffer('topics/a/t2/questions/q1/pic.png')).buffer, Buffer.from([1, 2, 3]))
		assert.deepEqual(await storage.listFilesRecursive('topics/a/t1'), [])
		assert.equal(fs.existsSync(path.join(root, 'topics', 'a', 't1')), false)
		assert.equal(await storage.readFile('topics/a/other/keep.md'), 'keep')
	})

	test('overwrites an existing destination file', async () => {
		const storage = new StorageService()
		await storage.writeFile('m/old/a.md', 'new content')
		await storage.writeFile('m/new/a.md', 'stale content')
		await storage.moveDirectory('m/old', 'm/new')
		assert.equal(await storage.readFile('m/new/a.md'), 'new content')
	})

	test('moving into its own subdirectory keeps the files', async () => {
		const storage = new StorageService()
		await storage.writeFile('n/a/f.md', 'f')
		await storage.moveDirectory('n/a', 'n/a/inner')
		assert.deepEqual(await storage.listFilesRecursive('n/a'), ['n/a/inner/f.md'])
	})

	test('a missing source prefix is a no-op', async () => {
		await new StorageService().moveDirectory('nothing/here', 'nothing/there')
		assert.equal(fs.existsSync(path.join(root, 'nothing', 'there')), false)
	})

	test('requires both prefixes', async () => {
		await assert.rejects(() => new StorageService().moveDirectory('', 'x'), /both oldPrefix and newPrefix are required/)
	})

	test('rejects a destination that escapes the root and moves nothing', async () => {
		const storage = new StorageService()
		await storage.writeFile('mv/src/a.md', 'a')
		const before = snapshot(base)

		for (const target of ['../escaped', 'mv/../../escaped', '/abs/escaped', '../data-evil/x']) {
			await assert.rejects(() => storage.moveDirectory('mv/src', target), ESCAPE_MESSAGE)
		}
		assert.deepEqual(snapshot(base), before)
	})

	test('rejects a source that escapes the root', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		await assert.rejects(() => storage.moveDirectory('../outside', 'taken'), ESCAPE_MESSAGE)
		assert.deepEqual(snapshot(outside), ['secret.md'])
	})

	test('rejects a destination behind a symlink that points outside', async () => {
		const storage = new StorageService()
		await storage.writeFile('mv/src/a.md', 'a')
		fs.symlinkSync(outside, path.join(root, 'link'))
		await assert.rejects(() => storage.moveDirectory('mv/src', 'link/dest'), ESCAPE_MESSAGE)
		assert.deepEqual(snapshot(outside), [])
		assert.equal(await storage.readFile('mv/src/a.md'), 'a')
	})

	test('does not touch the legacy web/public/uploads directory', async () => {
		const storage = new StorageService()
		const legacy = path.resolve(process.cwd(), '../web/public/uploads')
		const existedBefore = fs.existsSync(legacy)
		const listingBefore = existedBefore ? snapshot(legacy) : []
		await storage.writeFile('topics/a/t1/x.md', 'x')
		await storage.moveDirectory('topics/a/t1', 'topics/a/t2')
		assert.equal(fs.existsSync(legacy), existedBefore)
		if (existedBefore) assert.deepEqual(snapshot(legacy), listingBefore)
	})
})

describe('local mode: unsupported methods fail loudly', () => {
	test('createSignedUrl, getPublicUrl, createZip and listFilesWithMeta throw', async () => {
		const storage = new StorageService()
		const unsupported = /not supported in local storage mode/
		await assert.rejects(() => storage.createSignedUrl('a/b.png'), unsupported)
		assert.throws(() => storage.getPublicUrl('a/b.png'), unsupported)
		await assert.rejects(() => storage.createZip('topics/a'), unsupported)
		await assert.rejects(() => storage.listFilesWithMeta('images'), unsupported)
	})
})

describe('Supabase client lock-out', () => {
	const FAKE_URL = 'https://fake-project.invalid'
	const FAKE_KEY = 'fake-service-key'

	/** Свежий импорт модуля: SUPABASE_* читаются при загрузке */
	async function loadStorage() {
		vi.resetModules()
		return import('./storage.js')
	}

	beforeEach(() => {
		vi.stubEnv('STORAGE_DRIVER', undefined)
		vi.stubEnv('STORAGE_LOCAL_DIR', undefined)
		vi.stubEnv('SUPABASE_URL', FAKE_URL)
		vi.stubEnv('SUPABASE_SERVICE_KEY', FAKE_KEY)
	})

	test('isolated env never constructs a Supabase client, even with SUPABASE_* set', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await assert.rejects(() => storage.writeFile('a/b.md', 'x'), /Supabase not configured/)
		await assert.rejects(() => storage.writeJson('a/b.json', {}), /Supabase not configured/)
		await assert.rejects(
			() => storage.uploadBuffer('a/b.png', Buffer.from('x'), 'image/png'),
			/Supabase not configured/
		)
		await assert.rejects(() => storage.downloadBuffer('a/b.png'), /Supabase not configured/)
		assert.equal(await storage.readFile('a/b.md'), '')
		assert.equal(await storage.readJson('a/b.json'), null)
		assert.equal(await storage.exists('a/b.md'), false)
		assert.deepEqual(await storage.listFiles('a'), [])
		assert.deepEqual(await storage.listFilesRecursive('a'), [])
		await storage.deleteFiles(['a/b.md'])
		assert.equal(storage.getPublicUrl('a/b.png'), '')
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('isolated env reports Supabase as not configured even with SUPABASE_* set', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		const { StorageService: Fresh } = await loadStorage()
		assert.equal(new Fresh().isConfigured(), false)
	})

	test('without isolation and without the local driver the Supabase client is created once from the env values', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		assert.equal(storage.isConfigured(), true)
		assert.equal(await storage.readFile('a/b.md'), '')
		assert.equal(await storage.readFile('a/c.md'), '')
		errorSpy.mockRestore()

		assert.equal(createClientSpy.mock.calls.length, 1)
		assert.deepEqual(createClientSpy.mock.calls[0], [FAKE_URL, FAKE_KEY])
	})

	test('without any configuration the old fallbacks stay: reads are empty, writes throw', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		assert.equal(storage.isConfigured(), false)
		assert.equal(await storage.readFile('a/b.md'), '')
		await assert.rejects(() => storage.writeFile('a/b.md', 'x'), /Supabase not configured/)
		assert.equal(warnSpy.mock.calls.length, 1)
		warnSpy.mockRestore()
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('the local driver takes precedence over Supabase and never constructs a client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await storage.writeFile('p/a.md', 'local wins')
		assert.equal(await storage.readFile('p/a.md'), 'local wins')
		assert.equal(fs.readFileSync(path.join(root, 'p', 'a.md'), 'utf8'), 'local wins')
		await storage.moveDirectory('p', 'q')
		assert.deepEqual(await storage.listFilesRecursive('q'), ['q/a.md'])
		// isConfigured() по-прежнему означает «Supabase настроен»
		assert.equal(storage.isConfigured(), true)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('the local driver works in an isolated process with SUPABASE_* unset (e2e setup)', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await storage.writeFile('p/a.md', 'prompt')
		assert.equal(await storage.readFile('p/a.md'), 'prompt')
		assert.equal(storage.isConfigured(), false)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})
})
