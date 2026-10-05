'use client'

import type { JSX } from 'react'

import { isPluginEnabled, type PluginConfig } from '@/components/editor/plugins-config'
import { MentionsPlugin } from '@/components/editor/plugins/mentions-plugin'

export function MentionsPluginGroup({ pluginConfig }: { pluginConfig?: PluginConfig }): JSX.Element {
	return <>{isPluginEnabled('Mentions', pluginConfig) && <MentionsPlugin />}</>
}
