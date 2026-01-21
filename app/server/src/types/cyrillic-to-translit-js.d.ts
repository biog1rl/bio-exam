/**
 * Типы для внешней библиотеки «cyrillic-to-translit-js».
 * Нужны, чтобы TypeScript знал сигнатуры методов.
 */
declare module 'cyrillic-to-translit-js' {
	export default class CyrillicToTranslit {
		constructor()
		transform(input: string, spaceReplacement?: string): string
		reverse(input: string, spaceReplacement?: string): string
	}
}
