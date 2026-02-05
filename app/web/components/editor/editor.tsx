'use client'

import { InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'

import { useEffect, useRef } from 'react'

import { EditorState, SerializedEditorState } from 'lexical'

import { PluginConfig, PRESET_CONFIGS } from '@/components/editor/plugins-config'
import { editorTheme } from '@/components/editor/themes/editor-theme'
import { mdxToEditorState, editorStateToMdx } from '@/components/editor/utils/mdx-converter'
import { TooltipProvider } from '@/components/ui/tooltip'

import { nodes } from './nodes'
import { Plugins } from './plugins'

const editorConfig: InitialConfigType = {
	namespace: 'Editor',
	theme: editorTheme,
	nodes,
	onError: (error: Error) => {
		console.error(error)
	},
}

// Плагин для инициализации из MDX и конвертации изменений в MDX
function MdxPlugin({
	initialMdxContent,
	onMdxChange,
	lastInitialContent,
}: {
	initialMdxContent?: string
	onMdxChange?: (mdx: string) => void
	lastInitialContent: React.MutableRefObject<string | undefined>
}) {
	const [editor] = useLexicalComposerContext()
	const initialized = useRef(false)

	// Инициализация из MDX (при первой загрузке или изменении initialMdxContent)
	useEffect(() => {
		if (initialMdxContent !== undefined && initialMdxContent !== lastInitialContent.current) {
			lastInitialContent.current = initialMdxContent
			initialized.current = false
			mdxToEditorState(editor, initialMdxContent)
				.then(() => {
					initialized.current = true
				})
				.catch((error) => {
					console.error('Failed to initialize editor from MDX:', error)
					initialized.current = true
				})
		} else if (initialMdxContent === undefined) {
			initialized.current = true
		}
	}, [editor, initialMdxContent, lastInitialContent])

	// Конвертация изменений в MDX — только после инициализации
	useEffect(() => {
		if (!onMdxChange) return

		return editor.registerUpdateListener(({ editorState }) => {
			if (!initialized.current) return
			editorState.read(() => {
				const mdx = editorStateToMdx()
				onMdxChange(mdx)
			})
		})
	}, [editor, onMdxChange])

	return null
}

export function Editor({
	editorState,
	editorSerializedState,
	initialMdxContent,
	onChange,
	onSerializedChange,
	onMdxChange,
	pluginConfig,
	placeholder,
	preset,
	docPath,
}: {
	editorState?: EditorState
	editorSerializedState?: SerializedEditorState
	initialMdxContent?: string
	onChange?: (editorState: EditorState) => void
	onSerializedChange?: (editorSerializedState: SerializedEditorState) => void
	onMdxChange?: (mdx: string) => void
	pluginConfig?: PluginConfig
	placeholder?: string
	preset?: keyof typeof PRESET_CONFIGS
	docPath?: string
}) {
	const lastInitialContent = useRef<string | undefined>(undefined)

	// Используем preset или кастомную конфигурацию
	const finalPluginConfig = preset ? PRESET_CONFIGS[preset] : pluginConfig

	return (
		<div className="rounded-lg border shadow">
			<LexicalComposer
				initialConfig={{
					...editorConfig,
					...(editorState ? { editorState } : {}),
					...(editorSerializedState ? { editorState: JSON.stringify(editorSerializedState) } : {}),
				}}
			>
				<TooltipProvider>
					<Plugins pluginConfig={finalPluginConfig} customPlaceholder={placeholder} docPath={docPath} />

					<MdxPlugin
						initialMdxContent={initialMdxContent}
						onMdxChange={onMdxChange}
						lastInitialContent={lastInitialContent}
					/>

					<OnChangePlugin
						ignoreSelectionChange={true}
						onChange={(editorState) => {
							onChange?.(editorState)
							onSerializedChange?.(editorState.toJSON())
						}}
					/>
				</TooltipProvider>
			</LexicalComposer>
		</div>
	)
}
