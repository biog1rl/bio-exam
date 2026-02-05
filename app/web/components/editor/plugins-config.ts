// Список всех доступных плагинов для конфигурации
export type AvailablePlugin =
	// Core plugins (всегда включены)
	| 'RichText'
	| 'History'
	// Toolbar plugins
	| 'Toolbar'
	| 'HistoryToolbar'
	| 'BlockFormat'
	| 'FontFamily'
	| 'FontSize'
	| 'LineHeight'
	| 'FontFormat'
	| 'SubSuper'
	| 'Link'
	| 'ClearFormatting'
	| 'FontColor'
	| 'FontBackground'
	| 'ElementFormat'
	| 'BlockInsert'
	| 'CodeLanguage'
	// Content plugins
	| 'ClickableLink'
	| 'CheckList'
	| 'HorizontalRule'
	| 'Table'
	| 'List'
	| 'TabIndentation'
	| 'Hashtag'
	| 'Mentions'
	| 'Keywords'
	| 'Emojis'
	| 'Images'
	| 'Layout'
	| 'Embeds'
	| 'Twitter'
	| 'YouTube'
	| 'CodeHighlight'
	| 'CodeActionMenu'
	| 'MarkdownShortcut'
	| 'AutoLink'
	| 'AutoFocus'
	| 'ComponentPicker'
	| 'ContextMenu'
	| 'DragDropPaste'
	| 'EmojiPicker'
	| 'FloatingLinkEditor'
	| 'FloatingTextFormat'
	| 'DraggableBlock'
	// Action plugins
	| 'Actions'
	| 'CharacterCounter'
	| 'SpeechToText'
	| 'ShareContent'
	| 'ImportExport'
	| 'MarkdownToggle'
	| 'EditModeToggle'
	| 'ClearEditor'
	| 'TreeView'

export type PluginConfig = {
	include?: AvailablePlugin[]
	exclude?: AvailablePlugin[]
}

// Предустановленные конфигурации
export const PRESET_CONFIGS = {
	// Полный набор (по умолчанию)
	full: {
		include: undefined,
		exclude: [],
	} as PluginConfig,

	// Минимальный набор для форм
	minimal: {
		include: [
			'RichText',
			'History',
			'Toolbar',
			'HistoryToolbar',
			'FontFormat',
			'Link',
			'List',
			'MarkdownShortcut',
			'AutoLink',
			'FloatingLinkEditor',
			'FloatingTextFormat',
		],
	} as PluginConfig,

	// Средний набор с форматированием
	standard: {
		include: [
			'RichText',
			'History',
			'Toolbar',
			'HistoryToolbar',
			'BlockFormat',
			'FontFormat',
			'Link',
			'ClearFormatting',
			'List',
			'CheckList',
			'Table',
			'HorizontalRule',
			'ClickableLink',
			'MarkdownShortcut',
			'AutoLink',
			'FloatingLinkEditor',
			'FloatingTextFormat',
			'CodeHighlight',
			'DraggableBlock',
			'DragDropPaste',
		],
	} as PluginConfig,

	// Для документации (без экшенов типа TreeView, EditMode)
	document: {
		exclude: ['TreeView', 'EditModeToggle', 'ClearEditor', 'SpeechToText'],
	} as PluginConfig,
} as const

export function isPluginEnabled(pluginName: AvailablePlugin, config?: PluginConfig): boolean {
	if (!config) return true // По умолчанию все включены

	// Если указан include, проверяем наличие в нём
	if (config.include && config.include.length > 0) {
		return config.include.includes(pluginName)
	}

	// Если указан exclude, проверяем отсутствие в нём
	if (config.exclude && config.exclude.length > 0) {
		return !config.exclude.includes(pluginName)
	}

	return true
}
