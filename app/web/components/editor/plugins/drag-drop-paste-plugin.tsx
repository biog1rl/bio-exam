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
import type { UploadAssetResponse } from '@/types/assets'

const ACCEPTABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function uploadImageToAPI(file: File, docPath?: string): Promise<string | null> {
	try {
		if (file.size > 5 * 1024 * 1024) {
			toast.error('Файл слишком большой. Максимум 5 MB')
			return null
		}
		const formData = new FormData()
		formData.append('file', file)
		if (docPath) {
			formData.append('docPath', docPath)
		}
		const response = await fetch('/api/docs/assets', {
			method: 'POST',
			body: formData,
		})
		if (!response.ok) {
			const data = await response.json().catch(() => ({ error: 'Upload failed' }))
			toast.error(data.error || 'Не удалось загрузить изображение')
			return null
		}
		const data: UploadAssetResponse = await response.json()
		return data.path
	} catch (error) {
		console.error('Error uploading image:', error)
		toast.error('Не удалось загрузить изображение')
		return null
	}
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
