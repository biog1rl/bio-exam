'use client'

import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'

import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote'
import { serialize } from 'next-mdx-remote/serialize'

import { getSignedUrl, getStoragePathForImageSrc } from '@/lib/image-signed-url-cache'
import { buildMdxOptions } from '@/lib/mdx/options'

type Props = {
	source?: string | null
	className?: string
}

const mdxCache = new Map<string, MDXRemoteSerializeResult>()

type MdxImageProps = ImgHTMLAttributes<HTMLImageElement>

function normalizeImageSrc(src: string): string {
	// Support markdown with "uploads/..." paths by converting them to site-root absolute URLs.
	if (src.startsWith('uploads/')) return `/${src}`
	return src
}

function MdxImage({ src, alt, ...props }: MdxImageProps) {
	const rawSrc = typeof src === 'string' ? src : ''
	const normalizedSrc = normalizeImageSrc(rawSrc)
	const storagePath = getStoragePathForImageSrc(normalizedSrc)
	const [resolvedSrc, setResolvedSrc] = useState<string>(() => (normalizedSrc && !storagePath ? normalizedSrc : ''))

	useEffect(() => {
		if (!normalizedSrc) {
			setResolvedSrc('')
			return
		}

		if (!storagePath) {
			setResolvedSrc(normalizedSrc)
			return
		}

		let cancelled = false
		getSignedUrl(storagePath)
			.then((signedUrl) => {
				if (!cancelled) {
					setResolvedSrc(signedUrl)
				}
			})
			.catch(() => {
				if (!cancelled) {
					// Fallback to original src in case this is a valid relative URL outside storage.
					setResolvedSrc(normalizedSrc)
				}
			})

		return () => {
			cancelled = true
		}
	}, [normalizedSrc, storagePath])

	if (!resolvedSrc) {
		return null
	}

	// eslint-disable-next-line @next/next/no-img-element
	return <img {...props} src={resolvedSrc} alt={alt ?? ''} />
}

export default function MdxRenderer({ source, className }: Props) {
	const normalized = useMemo(() => (source ?? '').trim(), [source])
	const [compiled, setCompiled] = useState<MDXRemoteSerializeResult | null>(null)
	const [hasError, setHasError] = useState(false)
	const components = useMemo(() => ({ img: MdxImage }), [])

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
			<MDXRemote {...compiled} components={components} />
		</div>
	)
}
