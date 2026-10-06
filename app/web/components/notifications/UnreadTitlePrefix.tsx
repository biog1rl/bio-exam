'use client'

import { useEffect } from 'react'

import { titlePrefix, withTitlePrefix } from '@/lib/notifications/format'

export default function UnreadTitlePrefix({ count }: Readonly<{ count: number }>) {
	const prefix = titlePrefix(count)

	useEffect(() => {
		const apply = () => {
			const next = withTitlePrefix(document.title, prefix)
			if (next !== document.title) document.title = next
		}
		apply()
		const observer = new MutationObserver(apply)
		observer.observe(document.head, { childList: true, characterData: true, subtree: true })
		return () => observer.disconnect()
	}, [prefix])

	useEffect(
		() => () => {
			document.title = withTitlePrefix(document.title, '')
		},
		[]
	)

	return null
}
