import {
	$getSelection,
	type BaseSelection,
	COMMAND_PRIORITY_CRITICAL,
	type LexicalEditor,
	SELECTION_CHANGE_COMMAND,
} from 'lexical'

export type ToolbarEditorLike = {
	registerCommand: LexicalEditor['registerCommand']
	getEditorState: LexicalEditor['getEditorState']
}

export function subscribeToolbar(
	editor: ToolbarEditorLike,
	handler: () => (selection: BaseSelection) => void
): () => void {
	const notify = () => {
		const selection = $getSelection()
		if (selection) handler()(selection)
	}

	const unregister = editor.registerCommand(
		SELECTION_CHANGE_COMMAND,
		() => {
			notify()
			return false
		},
		COMMAND_PRIORITY_CRITICAL
	)

	editor.getEditorState().read(notify)

	return unregister
}
