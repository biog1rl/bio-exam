import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

import { StorageConflictError, StorageNotFoundError } from './port.js'
import { StorageService } from './storage.js'

// Шпион на createClient: изолированный процесс не должен создавать клиент Supabase (D-17).
// Вынесен через vi.hoisted, чтобы переживать vi.resetModules() в тестах с динамическим импортом.
const createClientSpy = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))

// Локальный режим StorageService (D-18): все ключи живут внутри STORAGE_LOCAL_DIR.
// Тесты работают только с временным каталогом, без базы данных и без Supabase.

const KEY_ERROR = (error: unknown) => error instanceof Error && error.name === 'StorageKeyError'
const CONFIG_ERROR = (error: unknown) => error instanceof Error && error.name === 'StorageConfigError'

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
			() => new StorageService().writeFile('topics/a/b.md', 'x'),
			/STORAGE_LOCAL_DIR must be an absolute path/
		)
	})

	test('missing STORAGE_LOCAL_DIR is rejected', async () => {
		vi.stubEnv('STORAGE_LOCAL_DIR', '')
		await assert.rejects(
			() => new StorageService().readFile('topics/a/b.md'),
			/STORAGE_LOCAL_DIR must be an absolute path/
		)
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
		await storage.writeFile('topics/a/f.md', 'one')
		await storage.writeFile('topics/a/f.md', 'two')
		assert.equal(await storage.readFile('topics/a/f.md'), 'two')
		assert.deepEqual(fs.readdirSync(path.join(root, 'topics', 'a')), ['f.md'])
	})

	test('a failed write cleans up its temporary file', async () => {
		const storage = new StorageService()
		fs.mkdirSync(path.join(root, 'topics', 'a', 'dir'), { recursive: true })
		await assert.rejects(() => storage.writeFile('topics/a/dir', 'x'))
		assert.deepEqual(fs.readdirSync(path.join(root, 'topics', 'a')), ['dir'])
	})

	test('writeJson and readJson round-trip an object, missing key gives null', async () => {
		const storage = new StorageService()
		const data = { a: 1, список: ['x', 'y'], nested: { ok: true } }
		await storage.writeJson('topics/t/settings.json', data)
		assert.deepEqual(await storage.readJson('topics/t/settings.json'), data)
		assert.equal(await storage.readJson('topics/t/missing.json'), null)
	})

	test('readJson of invalid JSON rejects instead of hiding the parse error', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/broken.json', '{not json')
		await assert.rejects(() => storage.readJson('topics/t/broken.json'), SyntaxError)
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
			StorageConflictError
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
			await storage.uploadBuffer(`topics/ct/${name}`, Buffer.from('x'), 'application/octet-stream')
			assert.equal((await storage.downloadBuffer(`topics/ct/${name}`)).contentType, expected, name)
		}
	})

	test('downloadBuffer of a missing key rejects', async () => {
		await assert.rejects(() => new StorageService().downloadBuffer('images/none.png'), StorageNotFoundError)
	})

	test('readFilesParallel returns a Map with only the existing keys', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/p/a.md', 'A')
		await storage.writeFile('topics/p/b.md', 'B')
		const result = await storage.readFilesParallel(['topics/p/a.md', 'topics/p/missing.md', 'topics/p/b.md'], 2)
		assert.deepEqual(
			[...result.entries()],
			[
				['topics/p/a.md', 'A'],
				['topics/p/b.md', 'B'],
			]
		)
		assert.equal((await storage.readFilesParallel([])).size, 0)
	})

	test('exists is true for files only', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/e/a.md', 'A')
		assert.equal(await storage.exists('topics/e/a.md'), true)
		assert.equal(await storage.exists('topics/e/b.md'), false)
		assert.equal(await storage.exists('topics/e'), false)
	})

	test('deleteFiles removes files and ignores missing keys', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/d/a.md', 'A')
		await storage.writeFile('topics/d/b.md', 'B')
		await storage.deleteFiles(['topics/d/a.md', 'topics/d/none.md'])
		assert.equal(await storage.exists('topics/d/a.md'), false)
		assert.equal(await storage.exists('topics/d/b.md'), true)
		await storage.deleteFiles([])
	})

	test('listFiles returns direct files sorted by name', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/x/a.md', 'a')
		await storage.writeFile('topics/t/b.md', 'b')
		await storage.writeFile('topics/t/a.md', 'a')
		assert.deepEqual(await storage.listFiles('topics/t'), ['topics/t/a.md', 'topics/t/b.md'])
		assert.deepEqual(await storage.listFiles('topics/none'), [])
	})

	test('listFiles of a lone subdirectory returns no entries', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/t/x/a.md', 'a')
		assert.deepEqual(await storage.listFiles('topics/t'), [])
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
		assert.deepEqual(await storage.listFilesRecursive('topics/nothing'), [])
	})

	test('listings do not expose or follow symlinks', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/l/a.md', 'a')
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.symlinkSync(outside, path.join(root, 'topics', 'l', 'link'))
		assert.deepEqual(await storage.listFilesRecursive('topics/l'), ['topics/l/a.md'])
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

			await assert.rejects(() => storage.writeFile(key, 'x'), KEY_ERROR)
			await assert.rejects(() => storage.readFile(key), KEY_ERROR)
			await assert.rejects(() => storage.writeJson(key, {}), KEY_ERROR)
			await assert.rejects(() => storage.readJson(key), KEY_ERROR)
			await assert.rejects(() => storage.uploadBuffer(key, Buffer.from('x'), 'text/plain'), KEY_ERROR)
			await assert.rejects(() => storage.downloadBuffer(key), KEY_ERROR)
			await assert.rejects(() => storage.exists(key), KEY_ERROR)
			await assert.rejects(() => storage.deleteFiles([key]), KEY_ERROR)
			await assert.rejects(() => storage.listFiles(key), KEY_ERROR)
			await assert.rejects(() => storage.listFilesRecursive(key), KEY_ERROR)
			await assert.rejects(() => storage.deleteDirectory(key), KEY_ERROR)
			await assert.rejects(() => storage.readFilesParallel(['topics/ok.md', key]), KEY_ERROR)

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

	test('a literal %2e%2e segment is rejected as a parent segment after decoding', async () => {
		const storage = new StorageService()
		await assert.rejects(() => storage.writeFile('topics/%2e%2e/x', 'literal'), KEY_ERROR)
		await assert.rejects(() => storage.readFile('topics/%2e%2e/x'), KEY_ERROR)
		await assert.rejects(() => storage.writeFile('topics/%252e%252e/x', 'literal'), KEY_ERROR)
		assert.deepEqual(snapshot(root), [])
		assert.deepEqual(snapshot(evil), [])
		assert.deepEqual(snapshot(outside), [])
	})

	test('a directory symlink pointing outside blocks writeFile and readFile through it', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.mkdirSync(path.join(root, 'topics'), { recursive: true })
		fs.symlinkSync(outside, path.join(root, 'topics', 'link'))

		await assert.rejects(() => storage.writeFile('topics/link/new.md', 'x'), KEY_ERROR)
		await assert.rejects(() => storage.writeFile('topics/link/deep/new.md', 'x'), KEY_ERROR)
		await assert.rejects(() => storage.readFile('topics/link/secret.md'), KEY_ERROR)
		await assert.rejects(() => storage.deleteFiles(['topics/link/secret.md']), KEY_ERROR)
		await assert.rejects(() => storage.exists('topics/link/secret.md'), KEY_ERROR)

		assert.deepEqual(snapshot(outside), ['secret.md'])
		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
	})

	test('a file symlink pointing outside blocks reads and overwrites', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		fs.mkdirSync(path.join(root, 'topics'), { recursive: true })
		fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'topics', 'filelink.md'))

		await assert.rejects(() => storage.readFile('topics/filelink.md'), KEY_ERROR)
		await assert.rejects(() => storage.writeFile('topics/filelink.md', 'overwritten'), KEY_ERROR)
		assert.equal(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8'), 'secret')
	})

	test('a dangling symlink pointing outside blocks writes', async () => {
		const storage = new StorageService()
		fs.mkdirSync(path.join(root, 'topics'), { recursive: true })
		fs.symlinkSync(path.join(outside, 'not-yet'), path.join(root, 'topics', 'dangling'))

		await assert.rejects(() => storage.writeFile('topics/dangling/x.md', 'x'), KEY_ERROR)
		await assert.rejects(() => storage.writeFile('topics/dangling', 'x'), KEY_ERROR)
		assert.deepEqual(snapshot(outside), [])
	})

	test('sibling-prefix trap: no key reaches the directory that shares the root prefix', async () => {
		const storage = new StorageService()
		fs.mkdirSync(path.join(root, 'topics'), { recursive: true })
		fs.symlinkSync(evil, path.join(root, 'topics', 'sib'))

		await assert.rejects(() => storage.writeFile('topics/sib/x', 'x'), KEY_ERROR)
		await assert.rejects(() => storage.writeFile('../data-evil/x', 'x'), KEY_ERROR)
		assert.deepEqual(snapshot(evil), [])
	})

	test('a symlink that stays inside the root is allowed', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/real/a.md', 'a')
		fs.symlinkSync(path.join(root, 'topics', 'real'), path.join(root, 'topics', 'alias'))
		assert.equal(await storage.readFile('topics/alias/a.md'), 'a')
		await storage.writeFile('topics/alias/b.md', 'b')
		assert.equal(fs.readFileSync(path.join(root, 'topics', 'real', 'b.md'), 'utf8'), 'b')
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
		await storage.writeFile('topics/m/old/a.md', 'new content')
		await storage.writeFile('topics/m/new/a.md', 'stale content')
		await storage.moveDirectory('topics/m/old', 'topics/m/new')
		assert.equal(await storage.readFile('topics/m/new/a.md'), 'new content')
	})

	test('moving into its own subdirectory keeps the files', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/n/a/f.md', 'f')
		await storage.moveDirectory('topics/n/a', 'topics/n/a/inner')
		assert.deepEqual(await storage.listFilesRecursive('topics/n/a'), ['topics/n/a/inner/f.md'])
	})

	test('a missing source prefix is a no-op', async () => {
		await new StorageService().moveDirectory('topics/nothing/here', 'topics/nothing/there')
		assert.equal(fs.existsSync(path.join(root, 'topics', 'nothing', 'there')), false)
	})

	test('requires both prefixes', async () => {
		await assert.rejects(() => new StorageService().moveDirectory('', 'x'), /both oldPrefix and newPrefix are required/)
	})

	test('rejects a destination that escapes the root and moves nothing', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/mv/src/a.md', 'a')
		const before = snapshot(base)

		for (const target of ['../escaped', 'topics/mv/../../escaped', '/abs/escaped', '../data-evil/x']) {
			await assert.rejects(() => storage.moveDirectory('topics/mv/src', target), KEY_ERROR)
		}
		assert.deepEqual(snapshot(base), before)
	})

	test('rejects a source that escapes the root', async () => {
		const storage = new StorageService()
		fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
		await assert.rejects(() => storage.moveDirectory('../outside', 'topics/taken'), KEY_ERROR)
		assert.deepEqual(snapshot(outside), ['secret.md'])
	})

	test('rejects a destination behind a symlink that points outside', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/mv/src/a.md', 'a')
		fs.symlinkSync(outside, path.join(root, 'topics', 'link'))
		await assert.rejects(() => storage.moveDirectory('topics/mv/src', 'topics/link/dest'), KEY_ERROR)
		assert.deepEqual(snapshot(outside), [])
		assert.equal(await storage.readFile('topics/mv/src/a.md'), 'a')
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

describe('local mode: URL, ZIP and media listing', () => {
	test('getPublicUrl returns the proxy route for the key', () => {
		const url = new StorageService().getPublicUrl('topics/a/b.png')
		assert.match(url, /^\/api\/docs\/assets\/proxy\?path=topics%2Fa%2Fb\.png&cacheNonce=\d+$/)
	})

	test('createZip packs the files under the prefix and skips answer keys unless asked', async () => {
		const storage = new StorageService()
		await storage.writeFile('topics/z/t/questions/q1/prompt.md', 'Q1')
		await storage.writeJson('topics/z/t/answer_keys.json', { q1: 'a' })
		const withoutAnswers = await storage.createZip('topics/z/t')
		assert.equal(withoutAnswers.subarray(0, 2).toString('latin1'), 'PK')
		assert.ok(withoutAnswers.includes(Buffer.from('questions/q1/prompt.md')))
		assert.ok(!withoutAnswers.includes(Buffer.from('answer_keys.json')))
		const withAnswers = await storage.createZip('topics/z/t', true)
		assert.ok(withAnswers.includes(Buffer.from('answer_keys.json')))
	})

	test('listFilesWithMeta pages direct files newest first with size and total', async () => {
		const storage = new StorageService()
		await storage.uploadBuffer('images/one.webp', Buffer.from('1'), 'image/webp')
		await storage.uploadBuffer('images/two.webp', Buffer.from('22'), 'image/webp')
		await storage.uploadBuffer('images/three.webp', Buffer.from('333'), 'image/webp')
		const page = await storage.listFilesWithMeta('images', { limit: 2, offset: 0 })
		assert.equal(page.total, 3)
		assert.equal(page.files.length, 2)
		for (const file of page.files) {
			assert.equal(file.id, `images/${file.name}`)
			assert.equal(file.metadata.size, file.name === 'one.webp' ? 1 : file.name === 'two.webp' ? 2 : 3)
			assert.equal(file.metadata.mimetype, 'image/webp')
			assert.ok(!Number.isNaN(Date.parse(file.created_at)))
		}
		assert.ok(page.files[0]!.created_at >= page.files[1]!.created_at)
		const rest = await storage.listFilesWithMeta('images', { limit: 2, offset: 2 })
		assert.equal(rest.files.length, 1)
		assert.equal(rest.total, 3)
	})

	test('createSignedUrl no longer exists', () => {
		assert.equal('createSignedUrl' in new StorageService(), false)
	})
})

describe('Supabase client lock-out', () => {
	const FAKE_URL = 'https://fake-project.invalid'
	const FAKE_KEY = 'fake-service-key'

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

	test('isolated env never constructs a Supabase client, even with SUPABASE_* set: the in-memory adapter serves it', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await storage.writeFile('topics/a/b.md', 'x')
		assert.equal(await storage.readFile('topics/a/b.md'), 'x')
		await storage.writeJson('topics/a/b.json', { ok: true })
		assert.deepEqual(await storage.readJson('topics/a/b.json'), { ok: true })
		await storage.uploadBuffer('images/b.png', Buffer.from('x'), 'image/png')
		assert.equal((await storage.downloadBuffer('images/b.png')).contentType, 'image/png')
		assert.equal(await storage.exists('topics/a/b.md'), true)
		assert.deepEqual(await storage.listFiles('topics/a'), ['topics/a/b.json', 'topics/a/b.md'])
		await storage.deleteFiles(['topics/a/b.md'])
		assert.equal(await storage.readFile('topics/a/b.md'), '')
		assert.match(storage.getPublicUrl('avatars/u/b.png'), /^\/api\/docs\/assets\/proxy\?path=avatars%2Fu%2Fb\.png/)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('isolated env selects the in-memory adapter, not Supabase, even with SUPABASE_* set', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		const { StorageService: Fresh } = await loadStorage()
		const { resolveStorageDriver } = await import('./index.js')
		assert.equal(new Fresh().isConfigured(), true)
		assert.equal(resolveStorageDriver(), 'memory')
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('isolated env refuses STORAGE_DRIVER=supabase with a configuration error and no client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('STORAGE_DRIVER', 'supabase')
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()
		assert.equal(storage.isConfigured(), false)
		await assert.rejects(() => storage.readFile('topics/a/b.md'), CONFIG_ERROR)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('without isolation and without the local driver the Supabase client is created once from the env values', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		createClientSpy.mockImplementation(() => ({
			storage: {
				from: () => ({
					download: async () => ({
						data: null,
						error: Object.assign(new Error('{}'), { name: 'StorageUnknownError', originalError: { status: 400 } }),
					}),
				}),
			},
		}))
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		assert.equal(storage.isConfigured(), true)
		assert.equal(await storage.readFile('topics/a/b.md'), '')
		assert.equal(await storage.readFile('topics/a/c.md'), '')

		assert.equal(createClientSpy.mock.calls.length, 1)
		assert.deepEqual(createClientSpy.mock.calls[0], [FAKE_URL, FAKE_KEY])
	})

	test('without any configuration every call fails with a configuration error and no client is created', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		assert.equal(storage.isConfigured(), false)
		await assert.rejects(() => storage.readFile('topics/a/b.md'), CONFIG_ERROR)
		await assert.rejects(() => storage.writeFile('topics/a/b.md', 'x'), CONFIG_ERROR)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('the local driver takes precedence over Supabase and never constructs a client', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await storage.writeFile('topics/p/a.md', 'local wins')
		assert.equal(await storage.readFile('topics/p/a.md'), 'local wins')
		assert.equal(fs.readFileSync(path.join(root, 'topics', 'p', 'a.md'), 'utf8'), 'local wins')
		await storage.moveDirectory('topics/p', 'topics/q')
		assert.deepEqual(await storage.listFilesRecursive('topics/q'), ['topics/q/a.md'])
		assert.equal(storage.isConfigured(), true)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('isolated env refuses the legacy ../web/public/uploads fallback instead of writing into the working tree', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		const legacy = path.resolve(process.cwd(), '../web/public/uploads')
		const before = fs.existsSync(legacy) ? snapshot(legacy) : null
		const { StorageService: Fresh, assertLegacyUploadsAllowed } = await loadStorage()

		const refusal = /legacy web\/public\/uploads fallback is disabled in isolated mode/
		assert.throws(() => assertLegacyUploadsAllowed(), refusal)
		await new Fresh().moveDirectory('topics/a/t1', 'topics/a/t2')
		assert.deepEqual(fs.existsSync(legacy) ? snapshot(legacy) : null, before)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})

	test('outside isolation the legacy fallback guard is a no-op (production path unchanged)', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '')
		const { assertLegacyUploadsAllowed } = await loadStorage()
		assert.doesNotThrow(() => assertLegacyUploadsAllowed())
	})

	test('the local driver works in an isolated process with SUPABASE_* unset (e2e setup)', async () => {
		vi.stubEnv('BIO_EXAM_ISOLATED_ENV', '1')
		vi.stubEnv('SUPABASE_URL', undefined)
		vi.stubEnv('SUPABASE_SERVICE_KEY', undefined)
		vi.stubEnv('STORAGE_DRIVER', 'local')
		vi.stubEnv('STORAGE_LOCAL_DIR', root)
		const { StorageService: Fresh } = await loadStorage()
		const storage = new Fresh()

		await storage.writeFile('topics/p/a.md', 'prompt')
		assert.equal(await storage.readFile('topics/p/a.md'), 'prompt')
		assert.equal(storage.isConfigured(), true)
		assert.equal(createClientSpy.mock.calls.length, 0)
	})
})
