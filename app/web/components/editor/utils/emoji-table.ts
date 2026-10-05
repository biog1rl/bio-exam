export type EmojiEntry = { emoji: string; aliases: string[]; tags: string[] }

export type EmojiTableLoader = {
	load(): Promise<readonly EmojiEntry[]>
	loaded(): readonly EmojiEntry[] | null
}

export const EMOJI_ALIAS_PATTERN = /:[a-z0-9_]+:/

export function createEmojiTableLoader(
	importer: () => Promise<{ emojiList: readonly EmojiEntry[] }>
): EmojiTableLoader {
	let table: readonly EmojiEntry[] | null = null
	let pending: Promise<readonly EmojiEntry[]> | null = null

	function load(): Promise<readonly EmojiEntry[]> {
		if (table) return Promise.resolve(table)
		if (pending) return pending
		const request = importer().then(
			(module) => {
				table = module.emojiList
				return module.emojiList
			},
			(error: unknown) => {
				if (pending === request) pending = null
				throw error
			}
		)
		pending = request
		return request
	}

	return { load, loaded: () => table }
}

const defaultLoader = createEmojiTableLoader(() => import('./emoji-list'))

export function loadEmojiTable(): Promise<readonly EmojiEntry[]> {
	return defaultLoader.load()
}

export function getLoadedEmojiTable(): readonly EmojiEntry[] | null {
	return defaultLoader.loaded()
}
