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
		source: `<script>globalThis.__mdxPwned = 'script'</script>

абзац`,
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
		expected: '<p>число  и  и </p>',
	},
	{
		name: 'объектный style',
		source: `<span style={{ color: 'red' }}>x</span>`,
		expected: '<span>x</span>',
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

	test(`${payload.name} не исполняется`, async () => {
		const { html } = await renderUntrusted(payload.source)
		assert.equal(pwned.__mdxPwned, undefined)
		assertInert(html)
	})
}

const STRIPPED_JSX: Array<{ name: string; source: string; forbidden: RegExp; kept: string }> = [
	{
		name: 'блочный script',
		source: `до

<script>globalThis.__mdxPwned = 'flow-script'</script>

после`,
		forbidden: /script|__mdxPwned/i,
		kept: 'после',
	},
	{
		name: 'строчный script',
		source: `до <script>globalThis.__mdxPwned = 'text-script'</script> после`,
		forbidden: /script|__mdxPwned/i,
		kept: 'после',
	},
	{
		name: 'script в верхнем регистре',
		source: `<SCRIPT>globalThis.__mdxPwned = 'upper'</SCRIPT>

после`,
		forbidden: /script|__mdxPwned/i,
		kept: 'после',
	},
	{
		name: 'srcdoc в любом регистре',
		source: `<iframe srcDoc="<b>x</b>" title="кадр"></iframe>`,
		forbidden: /srcdoc/i,
		kept: 'кадр',
	},
	{
		name: 'строковые on*',
		source: `<img src="/a.png" alt="картинка" onerror="globalThis.__mdxPwned='onerror'" />

<div ONCLICK="globalThis.__mdxPwned='click'">x</div>`,
		forbidden: /\bon(error|click)\b|__mdxPwned/i,
		kept: 'картинка',
	},
]

for (const item of STRIPPED_JSX) {
	test(`remarkStripUnsafeJsx вырезает из скомпилированного кода: ${item.name}`, async () => {
		const { compiledSource } = await serialize(normalizeMdxSource(item.source.trim()), buildMdxOptions())
		assert.doesNotMatch(compiledSource, item.forbidden)
		assert.ok(compiledSource.includes(item.kept), `нет ${item.kept} в ${compiledSource}`)
	})
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
