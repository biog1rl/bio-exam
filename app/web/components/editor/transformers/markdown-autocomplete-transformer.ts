import { TextMatchTransformer } from '@lexical/markdown'

import { AutocompleteNode } from '@/components/editor/nodes/autocomplete-node'

export const AUTOCOMPLETE: TextMatchTransformer = {
	dependencies: [AutocompleteNode],
	export: (node) => (node instanceof AutocompleteNode ? '' : null),
	regExp: /(?!)/,
	type: 'text-match',
}
