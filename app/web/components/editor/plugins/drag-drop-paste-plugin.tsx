'use client'

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { isMimeType } from '@lexical/utils'

import { useEffect } from 'react'

import { COMMAND_PRIORITY_LOW } from 'lexical'
import { toast } from 'sonner'

import { useDocPath } from '@/components/editor/context/doc-path-context'
import { INSERT_IMAGE_COMMAND } from '@/components/editor/plugins/images-plugin'
import { UPLOAD_FAILED_MESSAGE, uploadAsset } from '@/lib/assets/api'
import { failureMessage } from '@/lib/http/errors'

const ACCEPTABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function uploadImageToAPI(file: File, docPath?: string): Promise<string | null> {
	if (file.size > 5 * 1024 * 1024) {
		toast.error('Файл слишком большой. Максимум 5 MB')
		return null
	}
	const formData = new FormData()
	formData.append('file', file)
	if (docPath) {
		formData.append('docPath', docPath)
	}
	const outcome = await uploadAsset(formData)
	if (!outcome.ok) {
		const message = failureMessage(outcome, UPLOAD_FAILED_MESSAGE)
		if (message) toast.error(message)
		return null
	}
	return outcome.data.path
}

export function DragDropPastePlugin(): null {
	const [editor] = useLexicalComposerContext()
	const { docPath } = useDocPath()

	useEffect(() => {
		return editor.registerCommand(
			DRAG_DROP_PASTE,
			(files) => {
				;(async () => {
					for (const file of files) {
						if (isMimeType(file, ACCEPTABLE_IMAGE_TYPES)) {
							const src = await uploadImageToAPI(file, docPath)
							if (src) {
								editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
									altText: file.name,
									src,
								})
							}
							// Если upload не удался — файл не вставляется (no base64 fallback)
						}
					}
				})()
				return true
			},
			COMMAND_PRIORITY_LOW
		)
	}, [editor, docPath])
	return null
}
