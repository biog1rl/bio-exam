import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { highlightSnippet } from './highlight.js'

const QUERY = 'которым на рисунке обозначены капилляры'

function marked(html: string): string[] {
	return Array.from(html.matchAll(/<mark>(.*?)<\/mark>/g), (match) => match[1])
}

describe('highlightSnippet', () => {
	test('слова с другим окончанием подсвечиваются целиком: обозначен, капилляр', () => {
		const html = highlightSnippet('Каким номером на рисунке обозначен капилляр?', QUERY)
		assert.deepEqual(marked(html), ['на', 'рисунке', 'обозначен', 'капилляр'])
	})

	test('короткое слово запроса не подсвечивается внутри других слов', () => {
		const html = highlightSnippet('Какой цифрой на рисунке обозначена грана? Вена', QUERY)
		assert.deepEqual(marked(html), ['на', 'рисунке', 'обозначена'])
		assert.ok(html.includes('грана'))
		assert.ok(!html.includes('гра<mark>'))
	})

	test('частично набранное слово подсвечивает начало слов', () => {
		assert.deepEqual(marked(highlightSnippet('Строение клетки и клеточной стенки', 'кле')), ['клетки', 'клеточной'])
	})

	test('имена файлов картинок не попадают во фрагмент', () => {
		const html = highlightSnippet('Укажите номер желудка. image.png bdb7c20c578bb0048f99bdc1f0a1.jpeg', 'желудка')
		assert.equal(html, 'Укажите номер <mark>желудка</mark>.')
	})

	test('текст экранируется, без совпадений возвращается начало текста', () => {
		const html = highlightSnippet('<script>alert(1)</script> про митоз', 'мейоз')
		assert.equal(html, '&lt;script&gt;alert(1)&lt;/script&gt; про митоз')
		assert.deepEqual(marked(highlightSnippet('a < b и митоз', 'митоз')), ['митоз'])
	})
})
