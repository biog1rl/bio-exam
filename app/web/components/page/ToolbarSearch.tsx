'use client'

import { useEffect, useRef, useState } from 'react'

import { Search } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

const WRITE_DELAY_MS = 200

interface ToolbarSearchProps {
	value: string
	onChange: (value: string) => void
	label: string
	placeholder?: string
	className?: string
}

export function ToolbarSearch({ value, onChange, label, placeholder, className }: ToolbarSearchProps) {
	const searchParams = useSearchParams()
	const [draft, setDraft] = useState(value)
	const [pending, setPending] = useState(false)
	const [seenValue, setSeenValue] = useState(value)
	const [seenParams, setSeenParams] = useState(searchParams)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	if (value !== seenValue || searchParams !== seenParams) {
		setSeenValue(value)
		setSeenParams(searchParams)
		if (!pending && value !== draft) setDraft(value)
	}

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[]
	)

	const change = (next: string) => {
		setDraft(next)
		setPending(true)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			timer.current = null
			setPending(false)
			onChange(next)
		}, WRITE_DELAY_MS)
	}

	return (
		<label className={cn('relative block min-w-0 flex-1 tab-sm:w-72 tab-sm:flex-none', className)}>
			<Search
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			<Input
				type="search"
				value={draft}
				onChange={(event) => change(event.target.value)}
				placeholder={placeholder}
				aria-label={label}
				className="h-10 rounded-full bg-card pl-9"
			/>
		</label>
	)
}
