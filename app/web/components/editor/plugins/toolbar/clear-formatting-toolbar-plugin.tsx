'use client'

import { $isDecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode'
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isTableSelection } from '@lexical/table'
import { $getNearestBlockElementAncestorOrThrow } from '@lexical/utils'

import { useCallback } from 'react'

import { $createParagraphNode, $getSelection, $isRangeSelection, $isTextNode } from 'lexical'
import { EraserIcon } from 'lucide-react'

import { useToolbarContext } from '@/components/editor/context/toolbar-context'
import { Button } from '@/components/ui/button'

export function ClearFormattingToolbarPlugin() {
	const { activeEditor } = useToolbarContext()

	const clearFormatting = useCallback(() => {
		activeEditor.update(() => {
			const selection = $getSelection()
			if ($isRangeSelection(selection) || $isTableSelection(selection)) {
				const anchor = selection.anchor
				const focus = selection.focus
				const nodes = selection.getNodes()
				const extractedNodes = selection.extract()

				if (anchor.key === focus.key && anchor.offset === focus.offset) {
					return
				}

				nodes.forEach((node, idx) => {
					// Мы разделяем первый и последний узел по выделению
					// Чтобы не форматировать невыделенный текст внутри этих узлов
					if ($isTextNode(node)) {
						// Используем отдельную переменную, чтобы TS не потерял уточнение типа
						let textNode = node
						if (idx === 0 && anchor.offset !== 0) {
							textNode = textNode.splitText(anchor.offset)[1] || textNode
						}
						if (idx === nodes.length - 1) {
							textNode = textNode.splitText(focus.offset)[0] || textNode
						}
						/**
						 * Если к выделенному тексту применен один формат,
						 * выделение части текста может
						 * очистить формат для неправильной части текста.
						 *
						 * Очищенный текст основан на длине выделенного текста.
						 */
						// Нам это нужно на случай, если выделенный текст имеет только один формат
						const extractedTextNode = extractedNodes[0]
						if (nodes.length === 1 && $isTextNode(extractedTextNode)) {
							textNode = extractedTextNode
						}

						if (textNode.__style !== '') {
							textNode.setStyle('')
						}
						if (textNode.__format !== 0) {
							textNode.setFormat(0)
							$getNearestBlockElementAncestorOrThrow(textNode).setFormat('')
						}
						node = textNode
					} else if ($isHeadingNode(node) || $isQuoteNode(node)) {
						node.replace($createParagraphNode(), true)
					} else if ($isDecoratorBlockNode(node)) {
						node.setFormat('')
					}
				})
			}
		})
	}, [activeEditor])

	return (
		<Button
			className="h-8 w-8"
			aria-label="Clear formatting"
			variant={'outline'}
			size={'icon'}
			onClick={clearFormatting}
		>
			<EraserIcon className="h-4 w-4" />
		</Button>
	)
}
