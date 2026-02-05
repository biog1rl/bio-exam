import { MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'

import { JSX } from 'react'

import { LexicalEditor } from 'lexical'

export class ComponentPickerOption extends MenuOption {
	// Что отображается в редакторе
	title: string
	// Иконка для отображения
	icon?: JSX.Element
	// Для дополнительного поиска.
	keywords: Array<string>
	// TBD
	keyboardShortcut?: string
	// Что происходит при выборе этой опции?
	onSelect: (
		queryString: string,
		editor: LexicalEditor,
		showModal: (title: string, showModal: (onClose: () => void) => JSX.Element) => void
	) => void

	constructor(
		title: string,
		options: {
			icon?: JSX.Element
			keywords?: Array<string>
			keyboardShortcut?: string
			onSelect: (
				queryString: string,
				editor: LexicalEditor,
				showModal: (title: string, showModal: (onClose: () => void) => JSX.Element) => void
			) => void
		}
	) {
		super(title)
		this.title = title
		this.keywords = options.keywords || []
		this.icon = options.icon
		this.keyboardShortcut = options.keyboardShortcut
		this.onSelect = options.onSelect.bind(this)
	}
}
