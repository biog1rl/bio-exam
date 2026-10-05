'use client'

import type { JSX } from 'react'

import { isPluginEnabled, type PluginConfig } from '@/components/editor/plugins-config'
import { CodeActionMenuPlugin } from '@/components/editor/plugins/code-action-menu-plugin'

export function CodePluginGroup({
	pluginConfig,
	anchorElem,
}: {
	pluginConfig?: PluginConfig
	anchorElem: HTMLElement | null
}): JSX.Element {
	return <>{isPluginEnabled('CodeActionMenu', pluginConfig) && <CodeActionMenuPlugin anchorElem={anchorElem} />}</>
}
