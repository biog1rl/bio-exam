import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import { avatarUrl, ownStorageKey, parseStorageLink, resolveImageLink, storedAvatarValue } from './links.js'
import { StorageKeyError } from './port.js'

function proxyUrl(key: string): string {
	return `/api/docs/assets/proxy?path=${encodeURIComponent(key)}`
}

beforeEach(() => {
	vi.stubEnv('SUPABASE_URL', '')
	vi.stubEnv('SUPABASE_STORAGE_BUCKET', '')
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('parseStorageLink', () => {
	test('ключ остаётся ключом', () => {
		assert.deepEqual(parseStorageLink('images/a.webp'), { kind: 'key', key: 'images/a.webp' })
	})

	test('публичный URL своего бакета даёт ключ при совпадении хоста SUPABASE_URL', () => {
		vi.stubEnv('SUPABASE_URL', 'https://fake-project.supabase.test')
		const url = 'https://fake-project.supabase.test/storage/v1/object/public/main/images/a.webp'
		assert.deepEqual(parseStorageLink(url), { kind: 'key', key: 'images/a.webp' })
	})

	test('URL своего бакета на чужом хосте — внешний', () => {
		vi.stubEnv('SUPABASE_URL', 'https://other-project.supabase.test')
		const url = 'https://fake-project.supabase.test/storage/v1/object/public/main/images/a.webp'
		assert.deepEqual(parseStorageLink(url), { kind: 'external', url })
	})

	test('подписанный URL своего бакета без SUPABASE_URL даёт ключ, query отбрасывается', () => {
		const url = 'https://x.supabase.co/storage/v1/object/sign/main/topics/t/s/assets/b.png?token=1'
		assert.deepEqual(parseStorageLink(url), { kind: 'key', key: 'topics/t/s/assets/b.png' })
	})

	test('URL authenticated своего бакета с кодированным именем декодируется', () => {
		const url = 'https://x.supabase.co/storage/v1/object/authenticated/main/images/%D1%84%D0%BE%D1%82%D0%BE.webp'
		assert.deepEqual(parseStorageLink(url), { kind: 'key', key: 'images/фото.webp' })
	})

	test('бакет берётся из SUPABASE_STORAGE_BUCKET', () => {
		vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'media')
		const own = 'https://x.supabase.co/storage/v1/object/public/media/images/a.webp'
		const main = 'https://x.supabase.co/storage/v1/object/public/main/images/a.webp'
		assert.deepEqual(parseStorageLink(own), { kind: 'key', key: 'images/a.webp' })
		assert.deepEqual(parseStorageLink(main), { kind: 'external', url: main })
	})

	test('URL чужого бакета — внешний', () => {
		const url = 'https://x.supabase.co/storage/v1/object/public/other/images/a.webp'
		assert.deepEqual(parseStorageLink(url), { kind: 'external', url })
	})

	test('URL своего бакета с traversal в ключе — некорректный', () => {
		const url = 'https://x.supabase.co/storage/v1/object/public/main/images/..%2F..%2Fetc'
		assert.deepEqual(parseStorageLink(url), { kind: 'invalid' })
	})

	test('/uploads/images и uploads/images дают ключ images/', () => {
		assert.deepEqual(parseStorageLink('/uploads/images/a.webp'), { kind: 'key', key: 'images/a.webp' })
		assert.deepEqual(parseStorageLink('uploads/images/a.webp'), { kind: 'key', key: 'images/a.webp' })
	})

	test('/uploads/tests/<t>/<s>/assets переводится в topics/', () => {
		assert.deepEqual(parseStorageLink('/uploads/tests/t/s/assets/b.png'), {
			kind: 'key',
			key: 'topics/t/s/assets/b.png',
		})
	})

	test('/uploads/avatars даёт ключ avatars/', () => {
		assert.deepEqual(parseStorageLink('/uploads/avatars/u.png'), { kind: 'key', key: 'avatars/u.png' })
	})

	test('/uploads с traversal — некорректный', () => {
		assert.deepEqual(parseStorageLink('/uploads/../etc/passwd'), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink('/uploads/images/..%2F..%2Fx'), { kind: 'invalid' })
	})

	test('URL маршрута proxy даёт ключ из path', () => {
		assert.deepEqual(parseStorageLink('/api/docs/assets/proxy?path=images%2Fa.webp&cacheNonce=1'), {
			kind: 'key',
			key: 'images/a.webp',
		})
	})

	test('абсолютный URL маршрута proxy на любом хосте даёт ключ из path', () => {
		assert.deepEqual(
			parseStorageLink('https://bio.example.com/api/docs/assets/proxy?path=images%2Fx.webp&cacheNonce=1'),
			{
				kind: 'key',
				key: 'images/x.webp',
			}
		)
		assert.deepEqual(parseStorageLink('http://localhost:3000/api/docs/assets/proxy?path=avatars%2Fu%2Fa.png'), {
			kind: 'key',
			key: 'avatars/u/a.png',
		})
	})

	test('абсолютный URL маршрута proxy без path или с traversal — некорректный', () => {
		assert.deepEqual(parseStorageLink('https://bio.example.com/api/docs/assets/proxy?cacheNonce=1'), {
			kind: 'invalid',
		})
		assert.deepEqual(parseStorageLink('https://bio.example.com/api/docs/assets/proxy?path=..%2Fx'), { kind: 'invalid' })
	})

	test('URL маршрута proxy без path или с traversal — некорректный', () => {
		assert.deepEqual(parseStorageLink('/api/docs/assets/proxy?cacheNonce=1'), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink('/api/docs/assets/proxy?path=..%2Fx'), { kind: 'invalid' })
	})

	test('посторонний http(s) — внешний', () => {
		assert.deepEqual(parseStorageLink('https://example.com/x.png'), {
			kind: 'external',
			url: 'https://example.com/x.png',
		})
	})

	test('data:, пустая строка, не строка и ключ вне пространств — некорректные', () => {
		assert.deepEqual(parseStorageLink('data:image/png;base64,AA'), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink(''), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink(null), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink('main/images/a.webp'), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink('/etc/passwd'), { kind: 'invalid' })
		assert.deepEqual(parseStorageLink('images/../topics/t/s/answer_keys.json'), { kind: 'invalid' })
	})
})

describe('resolveImageLink', () => {
	test('ключ картинки даёт URL маршрута proxy', () => {
		assert.equal(resolveImageLink('images/a.webp'), proxyUrl('images/a.webp'))
		assert.equal(resolveImageLink('topics/t/s/assets/b.png'), proxyUrl('topics/t/s/assets/b.png'))
	})

	test('устаревшая ссылка разрешается через ключ', () => {
		assert.equal(resolveImageLink('/uploads/tests/t/s/assets/b.png'), proxyUrl('topics/t/s/assets/b.png'))
	})

	test('внешний URL возвращается как есть', () => {
		assert.equal(resolveImageLink('https://example.com/x.png'), 'https://example.com/x.png')
	})

	test('answer_keys.json, промпт, SVG и некорректная ссылка — StorageKeyError', () => {
		for (const input of [
			'topics/t/s/answer_keys.json',
			'topics/t/s/questions/q/prompt.md',
			'images/x.svg',
			'data:image/png;base64,AA',
		]) {
			assert.throws(() => resolveImageLink(input), StorageKeyError, input)
		}
	})
})

describe('avatarUrl', () => {
	test('пустое значение даёт null', () => {
		assert.equal(avatarUrl(null), null)
		assert.equal(avatarUrl(''), null)
	})

	test('ключ даёт URL по правилу модуля', () => {
		assert.equal(avatarUrl('avatars/u/a.png'), proxyUrl('avatars/u/a.png'))
	})

	test('посторонний URL возвращается как есть', () => {
		assert.equal(avatarUrl('https://example.com/a.png'), 'https://example.com/a.png')
	})
})

describe('ownStorageKey', () => {
	test('URL своего хранилища даёт ключ', () => {
		assert.equal(
			ownStorageKey('https://x.supabase.co/storage/v1/object/public/main/avatars/u/a.png'),
			'avatars/u/a.png'
		)
	})

	test('посторонний URL даёт null', () => {
		assert.equal(ownStorageKey('https://example.com/a.png'), null)
	})
})

describe('storedAvatarValue', () => {
	test('URL своего хранилища в avatars/ даёт ключ', () => {
		assert.equal(
			storedAvatarValue('https://x.supabase.co/storage/v1/object/public/main/avatars/u/a.png', 'u'),
			'avatars/u/a.png'
		)
		assert.equal(
			storedAvatarValue('/api/docs/assets/proxy?path=avatars%2Fu%2Fa.png&cacheNonce=1', 'u'),
			'avatars/u/a.png'
		)
	})

	test('посторонний URL сохраняется как есть', () => {
		assert.equal(storedAvatarValue('https://example.com/a.png', 'u'), 'https://example.com/a.png')
	})

	test('пустое значение даёт null', () => {
		assert.equal(storedAvatarValue('', 'u'), null)
		assert.equal(storedAvatarValue(null, 'u'), null)
	})
})
