'use client'

import { useEffect, useMemo, useState } from 'react'

import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote'
import { serialize } from 'next-mdx-remote/serialize'

import { buildMdxOptions } from '@/lib/mdx/options'

type Props = {
	source?: string | null
	className?: string
}

const mdxCache = new Map<string, MDXRemoteSerializeResult>()

export default function MdxRenderer({ source, className }: Props) {
	const normalized = useMemo(() => (source ?? '').trim(), [source])
	const [compiled, setCompiled] = useState<MDXRemoteSerializeResult | null>(null)
	const [hasError, setHasError] = useState(false)

	useEffect(() => {
		let cancelled = false

		async function compile() {
			if (!normalized) {
				setCompiled(null)
				setHasError(false)
				return
			}

			const cached = mdxCache.get(normalized)
			if (cached) {
				setCompiled(cached)
				setHasError(false)
				return
			}

			try {
				const result = await serialize(normalized, buildMdxOptions())
				if (cancelled) return
				mdxCache.set(normalized, result)
				setCompiled(result)
				setHasError(false)
			} catch (error) {
				if (cancelled) return
				console.error('Failed to compile MDX content:', error)
				setCompiled(null)
				setHasError(true)
			}
		}

		void compile()

		return () => {
			cancelled = true
		}
	}, [normalized])

	if (!normalized) {
		return null
	}

	if (hasError || !compiled) {
		return <div className={className ?? ''}>{normalized}</div>
	}

	return (
		<div className={className ?? ''}>
			<MDXRemote {...compiled} />
		</div>
	)
}
