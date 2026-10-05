import { TextMatchTransformer } from '@lexical/markdown'

import { $createTextNode } from 'lexical'

import { getLoadedEmojiTable } from '@/components/editor/utils/emoji-table'

export const EMOJI: TextMatchTransformer = {
	dependencies: [],
	export: () => null,
	importRegExp: /:([a-z0-9_]+):/,
	regExp: /:([a-z0-9_]+):/,
	replace: (textNode, [, name]) => {
		const emoji = getLoadedEmojiTable()?.find((e) => e.aliases.includes(name))?.emoji
		if (emoji) {
			textNode.replace($createTextNode(emoji))
		}
	},
	trigger: ':',
	type: 'text-match',
}
