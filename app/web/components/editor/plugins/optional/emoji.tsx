'use client'

import type { JSX } from 'react'

import { isPluginEnabled, type PluginConfig } from '@/components/editor/plugins-config'
import { EmojiPickerPlugin } from '@/components/editor/plugins/emoji-picker-plugin'

export function EmojiPluginGroup({ pluginConfig }: { pluginConfig?: PluginConfig }): JSX.Element {
	return <>{isPluginEnabled('EmojiPicker', pluginConfig) && <EmojiPickerPlugin />}</>
}
