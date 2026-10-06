/**
 * Транслитерация для формирования URL-дружественных slug'ов
 * и обратная операция — для «очеловечивания».
 */
import CyrillicToTranslit from 'cyrillic-to-translit-js'

const converter = new CyrillicToTranslit()

/**
 * Преобразует строку/путь в slug:
 * - кириллица → латиница
 * - пробелы и подчёркивания → дефисы, множественные дефисы схлопываются
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
				.replace(/[\s_]+/g, '-')
				.replace(/-+/g, '-')
				.replace(/[^a-z0-9-]/g, '')
				.replace(/^-+|-+$/g, '')
		)
		.join('/')
}
