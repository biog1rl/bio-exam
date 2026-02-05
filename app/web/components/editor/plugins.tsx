import {
	CHECK_LIST,
	ELEMENT_TRANSFORMERS,
	MULTILINE_ELEMENT_TRANSFORMERS,
	TEXT_FORMAT_TRANSFORMERS,
	TEXT_MATCH_TRANSFORMERS,
} from '@lexical/markdown'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { ClearEditorPlugin } from '@lexical/react/LexicalClearEditorPlugin'
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HashtagPlugin } from '@lexical/react/LexicalHashtagPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'

import { useState } from 'react'

import { ContentEditable } from '@/components/editor/editor-ui/content-editable'
import { AvailablePlugin, PluginConfig, isPluginEnabled } from '@/components/editor/plugins-config'
import { ActionsPlugin } from '@/components/editor/plugins/actions/actions-plugin'
import { ClearEditorActionPlugin } from '@/components/editor/plugins/actions/clear-editor-plugin'
import { CounterCharacterPlugin } from '@/components/editor/plugins/actions/counter-character-plugin'
import { EditModeTogglePlugin } from '@/components/editor/plugins/actions/edit-mode-toggle-plugin'
import { ImportExportPlugin } from '@/components/editor/plugins/actions/import-export-plugin'
import { MarkdownTogglePlugin } from '@/components/editor/plugins/actions/markdown-toggle-plugin'
import { ShareContentPlugin } from '@/components/editor/plugins/actions/share-content-plugin'
import { SpeechToTextPlugin } from '@/components/editor/plugins/actions/speech-to-text-plugin'
import { TreeViewPlugin } from '@/components/editor/plugins/actions/tree-view-plugin'
import { AutoLinkPlugin } from '@/components/editor/plugins/auto-link-plugin'
import { AutocompletePlugin } from '@/components/editor/plugins/autocomplete-plugin'
import { CodeActionMenuPlugin } from '@/components/editor/plugins/code-action-menu-plugin'
import { CodeHighlightPlugin } from '@/components/editor/plugins/code-highlight-plugin'
import { ComponentPickerMenuPlugin } from '@/components/editor/plugins/component-picker-menu-plugin'
import { ContextMenuPlugin } from '@/components/editor/plugins/context-menu-plugin'
import { DragDropPastePlugin } from '@/components/editor/plugins/drag-drop-paste-plugin'
import { DraggableBlockPlugin } from '@/components/editor/plugins/draggable-block-plugin'
import { AutoEmbedPlugin } from '@/components/editor/plugins/embeds/auto-embed-plugin'
import { TwitterPlugin } from '@/components/editor/plugins/embeds/twitter-plugin'
import { YouTubePlugin } from '@/components/editor/plugins/embeds/youtube-plugin'
import { EmojiPickerPlugin } from '@/components/editor/plugins/emoji-picker-plugin'
import { EmojisPlugin } from '@/components/editor/plugins/emojis-plugin'
import { FloatingLinkEditorPlugin } from '@/components/editor/plugins/floating-link-editor-plugin'
import { FloatingTextFormatToolbarPlugin } from '@/components/editor/plugins/floating-text-format-plugin'
import { ImagesPlugin } from '@/components/editor/plugins/images-plugin'
import { KeywordsPlugin } from '@/components/editor/plugins/keywords-plugin'
import { LayoutPlugin } from '@/components/editor/plugins/layout-plugin'
import { LinkPlugin } from '@/components/editor/plugins/link-plugin'
import { ListMaxIndentLevelPlugin } from '@/components/editor/plugins/list-max-indent-level-plugin'
import { MentionsPlugin } from '@/components/editor/plugins/mentions-plugin'
import { AlignmentPickerPlugin } from '@/components/editor/plugins/picker/alignment-picker-plugin'
import { BulletedListPickerPlugin } from '@/components/editor/plugins/picker/bulleted-list-picker-plugin'
import { CheckListPickerPlugin } from '@/components/editor/plugins/picker/check-list-picker-plugin'
import { CodePickerPlugin } from '@/components/editor/plugins/picker/code-picker-plugin'
import { ColumnsLayoutPickerPlugin } from '@/components/editor/plugins/picker/columns-layout-picker-plugin'
import { DividerPickerPlugin } from '@/components/editor/plugins/picker/divider-picker-plugin'
import { EmbedsPickerPlugin } from '@/components/editor/plugins/picker/embeds-picker-plugin'
import { HeadingPickerPlugin } from '@/components/editor/plugins/picker/heading-picker-plugin'
import { ImagePickerPlugin } from '@/components/editor/plugins/picker/image-picker-plugin'
import { NumberedListPickerPlugin } from '@/components/editor/plugins/picker/numbered-list-picker-plugin'
import { ParagraphPickerPlugin } from '@/components/editor/plugins/picker/paragraph-picker-plugin'
import { QuotePickerPlugin } from '@/components/editor/plugins/picker/quote-picker-plugin'
import { DynamicTablePickerPlugin, TablePickerPlugin } from '@/components/editor/plugins/picker/table-picker-plugin'
import { TabFocusPlugin } from '@/components/editor/plugins/tab-focus-plugin'
import { BlockFormatDropDown } from '@/components/editor/plugins/toolbar/block-format-toolbar-plugin'
import { FormatBulletedList } from '@/components/editor/plugins/toolbar/block-format/format-bulleted-list'
import { FormatCheckList } from '@/components/editor/plugins/toolbar/block-format/format-check-list'
import { FormatCodeBlock } from '@/components/editor/plugins/toolbar/block-format/format-code-block'
import { FormatHeading } from '@/components/editor/plugins/toolbar/block-format/format-heading'
import { FormatNumberedList } from '@/components/editor/plugins/toolbar/block-format/format-numbered-list'
import { FormatParagraph } from '@/components/editor/plugins/toolbar/block-format/format-paragraph'
import { FormatQuote } from '@/components/editor/plugins/toolbar/block-format/format-quote'
import { BlockInsertPlugin } from '@/components/editor/plugins/toolbar/block-insert-plugin'
import { InsertColumnsLayout } from '@/components/editor/plugins/toolbar/block-insert/insert-columns-layout'
import { InsertEmbeds } from '@/components/editor/plugins/toolbar/block-insert/insert-embeds'
import { InsertHorizontalRule } from '@/components/editor/plugins/toolbar/block-insert/insert-horizontal-rule'
import { InsertImage } from '@/components/editor/plugins/toolbar/block-insert/insert-image'
import { InsertTable } from '@/components/editor/plugins/toolbar/block-insert/insert-table'
import { ClearFormattingToolbarPlugin } from '@/components/editor/plugins/toolbar/clear-formatting-toolbar-plugin'
import { CodeLanguageToolbarPlugin } from '@/components/editor/plugins/toolbar/code-language-toolbar-plugin'
import { ElementFormatToolbarPlugin } from '@/components/editor/plugins/toolbar/element-format-toolbar-plugin'
import { FontBackgroundToolbarPlugin } from '@/components/editor/plugins/toolbar/font-background-toolbar-plugin'
import { FontColorToolbarPlugin } from '@/components/editor/plugins/toolbar/font-color-toolbar-plugin'
import { FontFamilyToolbarPlugin } from '@/components/editor/plugins/toolbar/font-family-toolbar-plugin'
import { FontFormatToolbarPlugin } from '@/components/editor/plugins/toolbar/font-format-toolbar-plugin'
import { FontSizeToolbarPlugin } from '@/components/editor/plugins/toolbar/font-size-toolbar-plugin'
import { HistoryToolbarPlugin } from '@/components/editor/plugins/toolbar/history-toolbar-plugin'
import { LineHeightToolbarPlugin } from '@/components/editor/plugins/toolbar/line-height-toolbar-plugin'
import { LinkToolbarPlugin } from '@/components/editor/plugins/toolbar/link-toolbar-plugin'
import { SubSuperToolbarPlugin } from '@/components/editor/plugins/toolbar/subsuper-toolbar-plugin'
import { ToolbarPlugin } from '@/components/editor/plugins/toolbar/toolbar-plugin'
import { TypingPerfPlugin } from '@/components/editor/plugins/typing-pref-plugin'
import { EMOJI } from '@/components/editor/transformers/markdown-emoji-transformer'
import { HR } from '@/components/editor/transformers/markdown-hr-transformer'
import { IMAGE, IMAGE_HTML } from '@/components/editor/transformers/markdown-image-transformer'
import { TABLE } from '@/components/editor/transformers/markdown-table-transformer'
import { TWEET } from '@/components/editor/transformers/markdown-tweet-transformer'
import { ButtonGroup } from '@/components/ui/button-group'
import { Separator } from '@/components/ui/separator'

import { DocPathProvider } from './context/doc-path-context'

const placeholder = 'Press / for commands...'

export function Plugins({
	pluginConfig,
	customPlaceholder,
	docPath,
}: {
	pluginConfig?: PluginConfig
	customPlaceholder?: string
	docPath?: string
}) {
	const p = (name: string) => isPluginEnabled(name as AvailablePlugin, pluginConfig)
	const [floatingAnchorElem, setFloatingAnchorElem] = useState<HTMLDivElement | null>(null)
	const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false)

	const onRef = (_floatingAnchorElem: HTMLDivElement) => {
		if (_floatingAnchorElem !== null) {
			setFloatingAnchorElem(_floatingAnchorElem)
		}
	}

	return (
		<DocPathProvider docPath={docPath}>
			<div className="relative">
				{p('Toolbar') && (
					<ToolbarPlugin>
						{({ blockType }) => (
							<div className="vertical-align-middle sticky top-0 z-10 flex items-center gap-2 overflow-auto rounded-t-lg border-b p-1">
								{p('HistoryToolbar') && (
									<>
										<HistoryToolbarPlugin />
										<Separator orientation="vertical" className="h-7" />
									</>
								)}
								{p('BlockFormat') && (
									<BlockFormatDropDown>
										<FormatParagraph />
										<FormatHeading levels={['h1', 'h2', 'h3']} />
										<FormatNumberedList />
										<FormatBulletedList />
										<FormatCheckList />
										<FormatCodeBlock />
										<FormatQuote />
									</BlockFormatDropDown>
								)}
								{blockType === 'code' ? (
									p('CodeLanguage') && <CodeLanguageToolbarPlugin />
								) : (
									<>
										{p('FontFamily') && <FontFamilyToolbarPlugin />}
										{p('FontSize') && <FontSizeToolbarPlugin />}
										{p('LineHeight') && <LineHeightToolbarPlugin />}
										{(p('FontFamily') || p('FontSize') || p('LineHeight')) && (
											<Separator orientation="vertical" className="h-7" />
										)}

										{p('FontFormat') && (
											<>
												<FontFormatToolbarPlugin />
												<Separator orientation="vertical" className="h-7" />
											</>
										)}

										{p('SubSuper') && <SubSuperToolbarPlugin />}
										{p('Link') && <LinkToolbarPlugin setIsLinkEditMode={setIsLinkEditMode} />}
										{(p('SubSuper') || p('Link')) && <Separator orientation="vertical" className="h-7" />}

										{p('ClearFormatting') && (
											<>
												<ClearFormattingToolbarPlugin />
												<Separator orientation="vertical" className="h-7" />
											</>
										)}

										{(p('FontColor') || p('FontBackground')) && (
											<>
												<ButtonGroup>
													{p('FontColor') && <FontColorToolbarPlugin />}
													{p('FontBackground') && <FontBackgroundToolbarPlugin />}
												</ButtonGroup>
												<Separator orientation="vertical" className="h-7" />
											</>
										)}

										{p('ElementFormat') && (
											<>
												<ElementFormatToolbarPlugin />
												<Separator orientation="vertical" className="h-7" />
											</>
										)}

										{p('BlockInsert') && (
											<BlockInsertPlugin>
												<InsertHorizontalRule />
												<InsertImage />
												<InsertTable />
												<InsertColumnsLayout />
												<InsertEmbeds />
											</BlockInsertPlugin>
										)}
									</>
								)}
							</div>
						)}
					</ToolbarPlugin>
				)}
				<div className="relative">
					{p('AutoFocus') && <AutoFocusPlugin />}
					<RichTextPlugin
						contentEditable={
							<div className="">
								<div className="" ref={onRef}>
									<ContentEditable
										placeholder={customPlaceholder || placeholder}
										className="ContentEditable__root relative block h-full min-h-72 overflow-auto px-8 py-4 focus:outline-none"
									/>
								</div>
							</div>
						}
						ErrorBoundary={LexicalErrorBoundary}
					/>

					{p('ClickableLink') && <ClickableLinkPlugin />}
					{p('CheckList') && <CheckListPlugin />}
					{p('HorizontalRule') && <HorizontalRulePlugin />}
					{p('Table') && <TablePlugin />}
					{p('List') && <ListPlugin />}
					{p('TabIndentation') && <TabIndentationPlugin />}
					{p('Hashtag') && <HashtagPlugin />}
					<HistoryPlugin />

					{p('Mentions') && <MentionsPlugin />}
					{p('DraggableBlock') && <DraggableBlockPlugin anchorElem={floatingAnchorElem} />}
					{p('Keywords') && <KeywordsPlugin />}
					{p('Emojis') && <EmojisPlugin />}
					{p('Images') && <ImagesPlugin />}

					{p('Layout') && <LayoutPlugin />}

					{p('Embeds') && <AutoEmbedPlugin />}
					{p('Twitter') && <TwitterPlugin />}
					{p('YouTube') && <YouTubePlugin />}

					{p('CodeHighlight') && <CodeHighlightPlugin />}
					{p('CodeActionMenu') && <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />}

					{p('MarkdownShortcut') && (
						<MarkdownShortcutPlugin
							transformers={[
								TABLE,
								HR,
								IMAGE_HTML,
								IMAGE,
								EMOJI,
								TWEET,
								CHECK_LIST,
								...ELEMENT_TRANSFORMERS,
								...MULTILINE_ELEMENT_TRANSFORMERS,
								...TEXT_FORMAT_TRANSFORMERS,
								...TEXT_MATCH_TRANSFORMERS,
							]}
						/>
					)}
					<TypingPerfPlugin />
					<TabFocusPlugin />
					<AutocompletePlugin />
					{p('AutoLink') && <AutoLinkPlugin />}
					<LinkPlugin />

					{p('ComponentPicker') && (
						<ComponentPickerMenuPlugin
							baseOptions={[
								ParagraphPickerPlugin(),
								HeadingPickerPlugin({ n: 1 }),
								HeadingPickerPlugin({ n: 2 }),
								HeadingPickerPlugin({ n: 3 }),
								TablePickerPlugin(),
								CheckListPickerPlugin(),
								NumberedListPickerPlugin(),
								BulletedListPickerPlugin(),
								QuotePickerPlugin(),
								CodePickerPlugin(),
								DividerPickerPlugin(),
								EmbedsPickerPlugin({ embed: 'tweet' }),
								EmbedsPickerPlugin({ embed: 'youtube-video' }),
								ImagePickerPlugin(),
								ColumnsLayoutPickerPlugin(),
								AlignmentPickerPlugin({ alignment: 'left' }),
								AlignmentPickerPlugin({ alignment: 'center' }),
								AlignmentPickerPlugin({ alignment: 'right' }),
								AlignmentPickerPlugin({ alignment: 'justify' }),
							]}
							dynamicOptionsFn={DynamicTablePickerPlugin}
						/>
					)}

					{p('ContextMenu') && <ContextMenuPlugin />}
					{p('DragDropPaste') && <DragDropPastePlugin />}
					{p('EmojiPicker') && <EmojiPickerPlugin />}

					{p('FloatingLinkEditor') && (
						<FloatingLinkEditorPlugin
							anchorElem={floatingAnchorElem}
							isLinkEditMode={isLinkEditMode}
							setIsLinkEditMode={setIsLinkEditMode}
						/>
					)}
					{p('FloatingTextFormat') && (
						<FloatingTextFormatToolbarPlugin anchorElem={floatingAnchorElem} setIsLinkEditMode={setIsLinkEditMode} />
					)}

					<ListMaxIndentLevelPlugin />
				</div>
				{p('Actions') && (
					<ActionsPlugin>
						<div className="clear-both flex items-center justify-between gap-2 overflow-auto border-t p-1">
							<div className="flex flex-1 justify-start"></div>
							<div>{p('CharacterCounter') && <CounterCharacterPlugin charset="UTF-16" />}</div>
							<div className="flex flex-1 justify-end">
								{p('SpeechToText') && <SpeechToTextPlugin />}
								{p('ShareContent') && <ShareContentPlugin />}
								{p('ImportExport') && <ImportExportPlugin />}
								{p('MarkdownToggle') && (
									<MarkdownTogglePlugin
										shouldPreserveNewLinesInMarkdown={true}
										transformers={[
											TABLE,
											HR,
											IMAGE_HTML,
											IMAGE,
											EMOJI,
											TWEET,
											CHECK_LIST,
											...ELEMENT_TRANSFORMERS,
											...MULTILINE_ELEMENT_TRANSFORMERS,
											...TEXT_FORMAT_TRANSFORMERS,
											...TEXT_MATCH_TRANSFORMERS,
										]}
									/>
								)}
								{p('EditModeToggle') && <EditModeTogglePlugin />}
								{p('ClearEditor') && (
									<>
										<ClearEditorActionPlugin />
										<ClearEditorPlugin />
									</>
								)}
								{p('TreeView') && <TreeViewPlugin />}
							</div>
						</div>
					</ActionsPlugin>
				)}
			</div>
		</DocPathProvider>
	)
}
