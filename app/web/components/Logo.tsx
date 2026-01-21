'use client'

import { useEffect, useState } from 'react'

import { useLottie } from 'lottie-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'

import LogoAnimBlack from '@/public/logo_anim_lottie_black.json'
import LogoAnimWhite from '@/public/logo_anim_lottie_white.json'

const Logo = () => {
	const { resolvedTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	// Set mounted state on client-side only
	useEffect(() => {
		setMounted(true)
	}, [])

	// Default to light theme logo if theme is not yet detected
	const animationData = !mounted || resolvedTheme === 'light' ? LogoAnimBlack : LogoAnimWhite

	// Configure Lottie
	const { View } = useLottie({
		animationData,
		loop: false,
	})

	// Always render the logo, but update it when theme changes
	return (
		<Link className="w-20" href="/">
			{View}
		</Link>
	)
}

export default Logo
