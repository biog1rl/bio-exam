import { transliterate } from '../../lib/transliterate.js'

function asciiFold(input: string): string {
	return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function tokenizeUnicode(source: string): string[] {
	return Array.from(source.matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0].toLowerCase()).filter(Boolean)
}

/**
 * Формирует HTML-сниппет вокруг первого совпадения и подсвечивает его тегом <mark>.
 * @param {string} text Исходный «плоский» текст.
 * @param {string} query Строка запроса.
 * @param {number} [radius=80] Количество символов слева/справа от совпадения.
 * @returns {string} Безопасный HTML со сниппетом либо начало текста без подсветки.
 */
export function highlightSnippet(text: string, query: string, radius = 80): string {
	const source = withoutFileNames(text || '')
	if (!source) return ''

	const needles = queryNeedles(query)
	const words = Array.from(source.matchAll(WORD))
	const first = needles.length ? words.find((word) => matchesAny(word[0], needles)) : undefined
	if (!first) {
		const preview = source.slice(0, radius * 2)
		return escapeHtml(preview) + (source.length > radius * 2 ? '...' : '')
	}

	const pos = first.index ?? 0
	const start = Math.max(0, pos - radius)
	const end = Math.min(source.length, pos + first[0].length + radius)
	const chunk = source.slice(start, end)

	let out = ''
	let last = 0
	for (const word of chunk.matchAll(WORD)) {
		if (!matchesAny(word[0], needles)) continue
		const index = word.index ?? 0
		out += escapeHtml(chunk.slice(last, index))
		out += '<mark>' + escapeHtml(word[0]) + '</mark>'
		last = index + word[0].length
	}
	out += escapeHtml(chunk.slice(last))

	return (start > 0 ? '...' : '') + out + (end < source.length ? '...' : '')
}

const WORD = /[\p{L}\p{N}]+/gu
const FILE_NAME = /[\p{L}\p{N}_.-]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp|heic)(?![\p{L}\p{N}])/giu
const STEM_LENGTH = 4
const PREFIX_LENGTH = 3

function withoutFileNames(text: string): string {
	return text.replace(FILE_NAME, ' ').replace(/\s+/g, ' ').trim()
}

function queryNeedles(query: string): string[] {
	const tokens = tokenizeUnicode((query || '').toLowerCase())
	return Array.from(
		new Set(
			tokens
				.flatMap((t) => [t, asciiFold(t), transliterate(t)])
				.map((v) => v?.toLowerCase())
				.filter((v): v is string => Boolean(v))
		)
	)
}

function sharedPrefixLength(a: string, b: string): number {
	const limit = Math.min(a.length, b.length)
	let i = 0
	while (i < limit && a[i] === b[i]) i += 1
	return i
}

function wordMatches(word: string, needle: string): boolean {
	if (word === needle) return true
	if (needle.length >= PREFIX_LENGTH && word.startsWith(needle)) return true
	if (word.length < STEM_LENGTH || needle.length < STEM_LENGTH) return false
	const shared = sharedPrefixLength(word, needle)
	return shared >= STEM_LENGTH && shared >= Math.min(word.length, needle.length) - 2
}

function matchesAny(word: string, needles: string[]): boolean {
	const lower = word.toLowerCase()
	const folded = asciiFold(lower)
	return needles.some((needle) => wordMatches(lower, needle) || wordMatches(folded, needle))
}

/**
 * Экранирует спецсимволы для безопасной вставки в HTML.
 * @param {string} v Входная строка.
 * @returns {string} Экранированная строка.
 */
const escapeHtml = (v: string) =>
	v.replace(/[&<>"']/g, (ch) =>
		ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
	)
