'use client'

import { useEffect, useState, MouseEvent } from 'react'

import { useTheme } from 'next-themes'

import { Moon } from './icons/MoonIcon'
import { Sun } from './icons/SunIcon'
import { Button } from './ui/button'

type DocumentWithViewTransition = Document & {
	startViewTransition?: (callback: () => void) => void
}

type WindowWithViewTransition = Window & {
	startViewTransition?: (callback: () => void) => void
}

const ThemeSwitcher = ({ className }: { className?: string }) => {
	const { resolvedTheme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const toggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
		if (typeof window === 'undefined') return

		const btn = e.currentTarget
		const rect = btn.getBoundingClientRect()

		const x = rect.left + rect.width / 2
		const y = rect.top + rect.height / 2

		document.documentElement.style.setProperty('--theme-toggle-x', `${x}px`)
		document.documentElement.style.setProperty('--theme-toggle-y', `${y}px`)

		const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
		const runThemeChange = () => setTheme(nextTheme)

		const doc = document as DocumentWithViewTransition
		if (doc.startViewTransition) {
			doc.startViewTransition(() => {
				runThemeChange()
			})
			return
		}

		const win = window as WindowWithViewTransition
		if (win.startViewTransition) {
			win.startViewTransition(() => {
				runThemeChange()
			})
			return
		}

		runThemeChange()
	}

	if (!mounted) {
		return <Button size="icon" color="default" />
	}

	return (
		<Button onClick={toggleTheme} size="icon" variant="outline" color="default" className={className}>
			{resolvedTheme === 'dark' ? <Sun /> : <Moon />}
		</Button>
	)
}

export default ThemeSwitcher
