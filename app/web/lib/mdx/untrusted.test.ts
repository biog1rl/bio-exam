import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { MDXRemote } from 'next-mdx-remote'
import { serialize } from 'next-mdx-remote/serialize'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'

import { normalizeMdxSource } from './normalizeSource'
import { buildMdxOptions } from './options'

type PwnedGlobal = typeof globalThis & { __mdxPwned?: unknown }

const pwned = globalThis as PwnedGlobal

async function renderUntrusted(source: string): Promise<{ html: string; compiled: boolean }> {
	const normalized = normalizeMdxSource(source.trim())
	let result: Awaited<ReturnType<typeof serialize>>
	try {
		result = await serialize(normalized, buildMdxOptions())
	} catch {
		return { html: renderToString(createElement('div', null, normalized)), compiled: false }
	}
	return { html: renderToString(createElement(MDXRemote, { ...result, components: {} })), compiled: true }
}

function assertInert(html: string) {
	assert.doesNotMatch(html, /<script/i)
	assert.doesNotMatch(html, /\son[a-z]+=/i)
	assert.doesNotMatch(html, /\ssrcdoc=/i)
	for (const match of html.matchAll(/=\s*"([^"]*)"/g)) {
		assert.ok(!match[1].includes('__mdxPwned'), `атрибут содержит __mdxPwned: ${match[0]}`)
	}
}

const PAYLOADS: Array<{ name: string; source: string; compiled: boolean }> = [
	{
		name: 'выражение в блоке',
		source: `Абзац текста.

{globalThis.__mdxPwned = 'flow'}`,
		compiled: true,
	},
	{
		name: 'выражение в абзаце',
		source: `Текст {globalThis.__mdxPwned = 'inline'} дальше.`,
		compiled: true,
	},
	{
		name: 'ESM export (вырезает removeImportsExportsPlugin уже в v5)',
		source: `export const pwned = (globalThis.__mdxPwned = 'export')

абзац`,
		compiled: true,
	},
	{
		name: 'ESM import (вырезает removeImportsExportsPlugin уже в v5)',
		source: `import pwned from './pwned.js'

абзац`,
		compiled: true,
	},
	{
		name: 'выражение в атрибуте onError',
		source: `<img src="/a.png" alt="" onError={globalThis.__mdxPwned = 'attr'} />`,
		compiled: true,
	},
	{
		name: 'элемент script',
		source: `<script>globalThis.__mdxPwned = 'script'</script>`,
		compiled: true,
	},
	{
		name: 'iframe srcdoc со скриптом',
		source: `<iframe srcdoc="<script>globalThis.__mdxPwned='srcdoc'</script>"></iframe>`,
		compiled: true,
	},
	{
		name: 'строковые обработчики on*',
		source: `<img src="/a.png" alt="" onerror="globalThis.__mdxPwned='onerror'" />

<div onClick="globalThis.__mdxPwned='click'">x</div>`,
		compiled: true,
	},
	{
		name: 'javascript: в ссылках',
		source: `[ссылка](javascript:globalThis.__mdxPwned='link')

<a href="javascript:globalThis.__mdxPwned='a'">x</a>`,
		compiled: true,
	},
]

const KNOWN_HOLES = new Set([
	'выражение в блоке',
	'выражение в абзаце',
	'выражение в атрибуте onError',
	'элемент script',
	'iframe srcdoc со скриптом',
])

const LEGIT_FIXTURES: Array<{ name: string; source: string; expected: string[] }> = [
	{
		name: 'style у MDX-JSX span',
		source: '<span style="color: #e11d48; font-weight: 700">цвет</span>',
		expected: ['<span style="color:#e11d48;font-weight:700">цвет</span>'],
	},
	{
		name: 'style у блочного p',
		source: '<p style="text-align: center">по центру</p>',
		expected: ['<p style="text-align:center">по центру</p>'],
	},
	{
		name: 'GFM-таблица',
		source: `| А | Б |
| --- | --- |
| 1 | 2 |
| 3 | 4 |`,
		expected: [
			'<table>',
			'<th>А</th>',
			'<th>Б</th>',
			'<td>1</td>',
			'<td>2</td>',
			'<td>3</td>',
			'<td>4</td>',
			'</table>',
		],
	},
	{
		name: 'markdown-картинка',
		source: '![Клетка](uploads/tests/biology/cell/assets/a.png)',
		expected: ['<img src="uploads/tests/biology/cell/assets/a.png" alt="Клетка"/>'],
	},
	{
		name: 'HTML-картинка из редактора',
		source: '<img src="https://example.test/a.png" alt="схема" width="300" height="200" />',
		expected: ['<img src="https://example.test/a.png" alt="схема" width="300" height="200"/>'],
	},
	{
		name: 'нижний и верхний индексы',
		source: 'H<sub>2</sub>O и Ca<sup>2+</sup>',
		expected: ['<sub>2</sub>', '<sup>2+</sup>'],
	},
	{
		name: 'нумерация из редактора',
		source: `1) первый
2) второй`,
		expected: ['<p>1) первый</p>', '<p>2) второй</p>'],
	},
	{
		name: 'жирный и курсив',
		source: '**жирный** и *курсив*',
		expected: ['<strong>жирный</strong>', '<em>курсив</em>'],
	},
	{
		name: 'экранированные фигурные скобки',
		source: '\\{x\\}',
		expected: ['<p>{x}</p>'],
	},
]

const EXPRESSION_CONTENT: Array<{ name: string; source: string; expected: string }> = [
	{
		name: 'выражения в тексте',
		source: `число {2} и {' '} и {"{"}`,
		expected: '<p>число 2 и   и {</p>',
	},
	{
		name: 'объектный style',
		source: `<span style={{ color: 'red' }}>x</span>`,
		expected: '<span style="color:red">x</span>',
	},
]

beforeEach(() => {
	delete pwned.__mdxPwned
})

for (const payload of PAYLOADS) {
	test(`конвейер: ${payload.name} доходит до рендера`, async () => {
		const { html, compiled } = await renderUntrusted(payload.source)
		assert.equal(compiled, payload.compiled)
		assert.equal(typeof html, 'string')
		assert.ok(html.length > 0)
	})

	if (KNOWN_HOLES.has(payload.name)) {
		test.fails(`${payload.name} не исполняется — исправляется в Группе 4 (DEP-03)`, async () => {
			const { html } = await renderUntrusted(payload.source)
			assert.equal(pwned.__mdxPwned, undefined)
			assertInert(html)
		})
	} else {
		test(`${payload.name} не исполняется`, async () => {
			const { html } = await renderUntrusted(payload.source)
			assert.equal(pwned.__mdxPwned, undefined)
			assertInert(html)
		})
	}
}

for (const fixture of LEGIT_FIXTURES) {
	test(`эталон: ${fixture.name}`, async () => {
		const { html, compiled } = await renderUntrusted(fixture.source)
		assert.equal(compiled, true)
		for (const fragment of fixture.expected) {
			assert.ok(html.includes(fragment), `нет фрагмента ${fragment} в ${html}`)
		}
	})
}

for (const item of EXPRESSION_CONTENT) {
	test(`контент с выражениями: ${item.name}`, async () => {
		const { html, compiled } = await renderUntrusted(item.source)
		assert.equal(compiled, true)
		assert.equal(html.replace(/<!-- -->/g, ''), item.expected)
	})
}
