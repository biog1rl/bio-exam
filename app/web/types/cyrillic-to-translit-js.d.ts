declare module 'cyrillic-to-translit-js' {
	export default class CyrillicToTranslit {
		constructor()
		transform(input: string, spaceReplacement?: string): string
		reverse(input: string, spaceReplacement?: string): string
	}
}
