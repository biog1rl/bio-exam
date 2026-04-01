import CyrillicToTranslit from 'cyrillic-to-translit-js'

const converter = new CyrillicToTranslit()

/** Транслитерация кириллицы → латиница + слаг по сегментам пути */
export function transliterate(str: string): string {
	return str
		.split('/')
		.map(
			(part) =>
				converter
					.transform(part)
					.toLowerCase()
					.replace(/[\s_]+/g, '-') // пробелы и подчёркивания → тире
					.replace(/-+/g, '-') // схлопнуть повторные тире
					.replace(/[^a-z0-9-]/g, '') // убрать всё, кроме a-z0-9-
					.replace(/^-+|-+$/g, '') // обрезать тире по краям
		)
		.join('/')
}

/** Обратная (если потребуется для UI): тире → пробелы, затем reverse */
export function reverseTransliterate(str: string): string {
	return str
		.split('/')
		.map((part) => converter.reverse(part.replace(/-/g, ' ')))
		.join('/')
}

export function asciiFold(str: string): string {
	return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}
