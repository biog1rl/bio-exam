/**
 * Транслитерация для формирования URL-дружественных slug’ов
 * и обратная операция — для «очеловечивания».
 */
import CyrillicToTranslit from 'cyrillic-to-translit-js'

const converter = new CyrillicToTranslit()

/**
 * Преобразует строку/путь в slug:
 * - кириллица → латиница
 * - пробелы → дефисы, множественные дефисы схлопываются
 * - удаляются недопустимые символы
 * - результат в нижнем регистре
 */
export function transliterate(str: string): string {
	return str
		.split('/')
		.map((part) =>
			converter
				.transform(part)
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/-+/g, '-')
				.replace(/[^a-z0-9-_]/g, '')
				.replace(/^-+|-+$/g, '')
		)
		.join('/')
}

/**
 * Обратный переход: "kak-eto-rabotaet" → "ккак eto rabotaet" → кириллица.
 * Удобно для отображения понятных подписей.
 */
export function reverseTransliterate(str: string): string {
	return str
		.split('/')
		.map((part) => converter.reverse(part.replace(/-/g, ' ')))
		.join('/')
}
