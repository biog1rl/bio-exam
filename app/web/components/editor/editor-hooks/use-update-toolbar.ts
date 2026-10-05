import { useEffect } from 'react'

import type { BaseSelection } from 'lexical'

import { useToolbarContext } from '@/components/editor/context/toolbar-context'

import { subscribeToolbar } from './toolbar-subscription'
import { useLatestRef } from './use-debounce'

export function useUpdateToolbarHandler(callback: (selection: BaseSelection) => void) {
	const { activeEditor } = useToolbarContext()
	const callbackRef = useLatestRef(callback)

	useEffect(() => subscribeToolbar(activeEditor, () => callbackRef.current), [activeEditor, callbackRef])
}
