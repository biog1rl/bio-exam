import { transliterate } from '../../lib/transliterate.js'

/**
 * Убирает диакритику из Unicode-строки (например, résumé → resume).
 * @param {string} input Исходная строка.
 * @returns {string} Строка с базовыми ASCII-буквами.
 */
export function asciiFold(input: string): string {
	return (input || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

/** Регулярное выражение для выделения буквенно-цифровых слов (без пунктуации). */
const UNICODE_WORD = /[\p{L}\p{N}]+/gu

/**
 * Разбивает текст на токены (буквенно-цифровые слова).
 * @param {string} source Исходный текст (markdown, обычный, ввод пользователя).
 * @returns {string[]} Массив токенов в нижнем регистре.
 */
export function tokenizeUnicode(source: string): string[] {
	return (source || '').toLowerCase().match(UNICODE_WORD) ?? []
}

/**
 * Генерирует варианты одного термина для MiniSearch (оригинал, asciiFold, transliterate).
 * @param {string} term Один токен.
 * @returns {string[]} Массив уникальных вариантов написания.
 */
export function processTermAll(term: string): string[] {
	const base = (term || '').toLowerCase()
	const variants = new Set<string>([base])

	const fold = asciiFold(base)
	if (fold) variants.add(fold)

	const slug = transliterate(base)
	if (slug) variants.add(slug)

	return Array.from(variants)
}

/**
 * Формирует варианты запроса (оригинал, asciiFold, transliterate) для OR-поиска.
 * @param {string} rawQuery Исходная строка запроса.
 * @returns {string[]} Массив нормализованных вариантов без пустых значений.
 */
export function expandQueryVariants(rawQuery: string): string[] {
	const base = (rawQuery || '').toLowerCase().trim()
	if (!base) return []
	return Array.from(
		new Set(
			[base, transliterate(base), asciiFold(base)]
				.map((v) => v?.toLowerCase().trim())
				.filter((v): v is string => Boolean(v))
		)
	)
}
