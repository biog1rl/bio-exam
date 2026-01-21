'use client'

import { KeyboardEventHandler, useMemo } from 'react'

import { SearchIcon } from 'lucide-react'

import { Kbd, KbdGroup } from '@/components/ui/kbd'

import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { useSearch } from './SearchProvider'

export default function SearchButton() {
	const { openDialog } = useSearch()
	const isMac = useMemo(() => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform), [])

	const onKeyDown: KeyboardEventHandler<HTMLButtonElement> = (e) => {
		// Enter или Space — открыть
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			openDialog()
		}
		// Дублируем хоткей локально на всякий случай (глобальный в провайдере уже есть)
		if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || e.key.toLowerCase() === 'л') {
			e.preventDefault()
			openDialog()
		}
	}

	return (
		<div className="flex w-full max-w-xs flex-col gap-6">
			<Tooltip>
				<TooltipTrigger onKeyDown={onKeyDown} asChild>
					<Button size="icon" variant="outline" onClick={openDialog}>
						<SearchIcon size="4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<KbdGroup>
						<Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
						{'+'}
						<Kbd>K</Kbd>
					</KbdGroup>
				</TooltipContent>
			</Tooltip>
		</div>
	)
}
