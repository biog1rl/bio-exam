import { transliterate } from '../../lib/transliterate.js'
import { asciiFold, tokenizeUnicode } from './tokenize.js'

/**
 * Проверяет, что все слова из запроса встречаются в тексте.
 * @param {string} textLower Текст в нижнем регистре.
 * @param {string} textFold Текст после ascii-нормализации (без диакритики).
 * @param {string} query Строка запроса.
 * @returns {boolean} true, если все токены найдены; иначе false.
 */
export function includesAllTokens(textLower: string, textFold: string, query: string): boolean {
	const tokens = tokenizeUnicode((query || '').toLowerCase())
	if (!tokens.length) return false
	return tokens.every((t) => textLower.includes(t) || textFold.includes(t))
}

/**
 * Формирует HTML-сниппет вокруг первого совпадения и подсвечивает его тегом <mark>.
 * @param {string} text Исходный «плоский» текст.
 * @param {string} query Строка запроса.
 * @param {number} [radius=80] Количество символов слева/справа от совпадения.
 * @returns {string} Безопасный HTML со сниппетом либо начало текста без подсветки.
 */
export function highlightSnippet(text: string, query: string, radius = 80): string {
	if (!text) return ''

	const tokens = tokenizeUnicode((query || '').toLowerCase())
	if (!tokens.length) {
		const preview = text.slice(0, radius * 2)
		return escapeHtml(preview) + (text.length > radius * 2 ? '...' : '')
	}

	const needles = Array.from(
		new Set(
			tokens
				.flatMap((t) => [t, asciiFold(t), transliterate(t)])
				.map((v) => v?.toLowerCase())
				.filter((v): v is string => Boolean(v))
		)
	)

	const lower = text.toLowerCase()
	let pos = -1
	for (const n of needles) {
		const i = lower.indexOf(n)
		if (i !== -1 && (pos === -1 || i < pos)) pos = i
	}

	if (pos === -1) {
		const preview = text.slice(0, radius * 2)
		return escapeHtml(preview) + (text.length > radius * 2 ? '...' : '')
	}

	const start = Math.max(0, pos - radius)
	const end = Math.min(text.length, pos + needles[0].length + radius)
	const chunk = text.slice(start, end)

	const rx = new RegExp(needles.map(escapeRegExp).join('|'), 'gi')
	let out = ''
	let last = 0
	for (const m of chunk.matchAll(rx)) {
		const index = m.index ?? 0
		out += escapeHtml(chunk.slice(last, index))
		out += '<mark>' + escapeHtml(m[0]) + '</mark>'
		last = index + m[0].length
	}
	out += escapeHtml(chunk.slice(last))

	return (start > 0 ? '...' : '') + out + (end < text.length ? '...' : '')
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

/**
 * Экранирует спецсимволы регулярных выражений.
 * @param {string} v Входная строка.
 * @returns {string} Экранированная строка.
 */
const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
