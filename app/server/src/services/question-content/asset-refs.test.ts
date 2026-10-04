import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import { extractAssetRefs } from './asset-refs.js'

beforeEach(() => {
	vi.stubEnv('SUPABASE_URL', '')
	vi.stubEnv('SUPABASE_STORAGE_BUCKET', '')
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('extractAssetRefs', () => {
	test('markdown: ключ и публичный URL своего бакета, заголовок картинки отбрасывается', () => {
		assert.deepEqual(
			extractAssetRefs(
				'Текст ![схема](images/a.webp "t") и ![](https://x.supabase.co/storage/v1/object/public/main/images/b.webp)'
			),
			['images/a.webp', 'images/b.webp']
		)
	})

	test('HTML и JSX: устаревший /uploads/tests/ и src={"…"}', () => {
		assert.deepEqual(extractAssetRefs('<img src="/uploads/tests/t/s/assets/c.png"> <img src={"images/d.webp"} />'), [
			'images/d.webp',
			'topics/t/s/assets/c.png',
		])
	})

	test('HTML с одинарными кавычками и прокси-URL', () => {
		assert.deepEqual(
			extractAssetRefs(
				"<img alt='x' src='/api/docs/assets/proxy?path=images%2Fp.webp&cacheNonce=1'> ![](</uploads/images/q.webp>)"
			),
			['images/p.webp', 'images/q.webp']
		)
	})

	test('Lexical JSON: узел image во вложенных children', () => {
		const lexical = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{ type: 'paragraph', children: [{ type: 'text', text: 'Схема' }] },
					{ type: 'paragraph', children: [{ type: 'image', src: 'images/e.webp', altText: 'e' }] },
				],
			},
		})
		assert.deepEqual(extractAssetRefs(lexical), ['images/e.webp'])
	})

	test('внешние URL, data: и выход за пределы корня не попадают', () => {
		assert.deepEqual(extractAssetRefs('![](https://example.com/x.png) ![](data:image/png;base64,AA) ![](../etc)'), [])
	})

	test('повторы схлопываются, результат отсортирован', () => {
		assert.deepEqual(extractAssetRefs('![](images/z.webp) ![](images/a.webp) <img src="images/z.webp">'), [
			'images/a.webp',
			'images/z.webp',
		])
	})

	test('пустой текст и текст без картинок', () => {
		assert.deepEqual(extractAssetRefs(''), [])
		assert.deepEqual(extractAssetRefs(null), [])
		assert.deepEqual(extractAssetRefs('{не JSON ![](images/f.webp)'), ['images/f.webp'])
	})
})
