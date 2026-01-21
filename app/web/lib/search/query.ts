/**
 * Утилиты для поиска
 */

/**
 * Создаёт поисковое значение из нескольких строк
 */
export function makeSearchValue(...parts: (string | undefined)[]): string {
	return parts.filter(Boolean).join(' ').toLowerCase()
}

/**
 * Разбивает запрос на токены (группы слов)
 */
export function makeQueryGroups(query: string): string[] {
	return query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
}

/**
 * Проверяет, совпадает ли значение с токенами запроса
 */
export function matches(value: string, tokens: string[]): boolean {
	const lowerValue = value.toLowerCase()
	return tokens.every((token) => lowerValue.includes(token))
}
