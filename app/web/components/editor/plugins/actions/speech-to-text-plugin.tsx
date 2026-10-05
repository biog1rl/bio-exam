'use client'

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { useEffect, useState, useSyncExternalStore } from 'react'

import type { LexicalCommand, LexicalEditor, RangeSelection } from 'lexical'
import {
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_EDITOR,
	createCommand,
	REDO_COMMAND,
	UNDO_COMMAND,
} from 'lexical'
import { MicIcon } from 'lucide-react'

import { useReport } from '@/components/editor/editor-hooks/use-report'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { createBrowserSpeechRecognition, createSpeechSession, speechRecognitionSupported } from './speech-session'

export const SPEECH_TO_TEXT_COMMAND: LexicalCommand<boolean> = createCommand('SPEECH_TO_TEXT_COMMAND')

const VOICE_COMMANDS: Readonly<Record<string, (arg0: { editor: LexicalEditor; selection: RangeSelection }) => void>> = {
	'\n': ({ selection }) => {
		selection.insertParagraph()
	},
	redo: ({ editor }) => {
		editor.dispatchCommand(REDO_COMMAND, undefined)
	},
	undo: ({ editor }) => {
		editor.dispatchCommand(UNDO_COMMAND, undefined)
	},
}

function insertTranscript(editor: LexicalEditor, transcript: string): void {
	editor.update(() => {
		const selection = $getSelection()

		if ($isRangeSelection(selection)) {
			const command = VOICE_COMMANDS[transcript.toLowerCase().trim()]

			if (command) {
				command({
					editor,
					selection,
				})
			} else if (transcript.match(/\s*\n\s*/)) {
				selection.insertParagraph()
			} else {
				selection.insertText(transcript)
			}
		}
	})
}

function subscribeToSupport(): () => void {
	return () => {}
}

function supportedOnServer(): boolean {
	return false
}

function SpeechToTextControl() {
	const [editor] = useLexicalComposerContext()
	const [isEnabled, setIsEnabled] = useState<boolean>(false)
	const [isSpeechToText, setIsSpeechToText] = useState<boolean>(false)
	const report = useReport()

	useEffect(() => {
		if (!isEnabled) return

		let active = true
		const session = createSpeechSession({
			create: createBrowserSpeechRecognition,
			onText: (transcript, isFinal) => {
				if (!active) return
				report(transcript)
				if (isFinal) insertTranscript(editor, transcript)
			},
			onStop: () => {
				if (!active) return
				setIsEnabled(false)
				setIsSpeechToText(false)
			},
		})
		session.start()

		return () => {
			active = false
			session.dispose()
		}
	}, [editor, isEnabled, report])

	useEffect(() => {
		return editor.registerCommand(
			SPEECH_TO_TEXT_COMMAND,
			(_isEnabled: boolean) => {
				setIsEnabled(_isEnabled)
				return true
			},
			COMMAND_PRIORITY_EDITOR
		)
	}, [editor])

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					onClick={() => {
						editor.dispatchCommand(SPEECH_TO_TEXT_COMMAND, !isSpeechToText)
						setIsSpeechToText(!isSpeechToText)
					}}
					variant={isSpeechToText ? 'secondary' : 'ghost'}
					title="Speech To Text"
					aria-label={`${isSpeechToText ? 'Enable' : 'Disable'} speech to text`}
					className="p-2"
					size={'sm'}
				>
					<MicIcon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>Speech To Text</TooltipContent>
		</Tooltip>
	)
}

export function SpeechToTextPlugin() {
	const supported = useSyncExternalStore(subscribeToSupport, speechRecognitionSupported, supportedOnServer)

	return supported ? <SpeechToTextControl /> : null
}
