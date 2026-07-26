'use client'

import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'

import { Loader2 } from 'lucide-react'
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote'
import { serialize } from 'next-mdx-remote/serialize'

import { getSignedUrl, getStoragePathForImageSrc } from '@/lib/image-signed-url-cache'
import { normalizeMdxSource } from '@/lib/mdx/normalizeSource'
import { buildMdxOptions } from '@/lib/mdx/options'

type Props = {
	source?: string | null
	className?: string
}

const mdxCache = new Map<string, MDXRemoteSerializeResult>()

type MdxImageProps = ImgHTMLAttributes<HTMLImageElement>
const IMAGE_SKELETON_CLASS =
	'relative overflow-hidden rounded-md border border-border bg-muted shadow-inner before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent dark:before:via-white/15'

function ImageLoadingPlaceholder({ width, height }: { width?: number; height?: number }) {
	return (
		<span
			className={`my-2 flex h-48 w-full max-w-xl items-center justify-center ${IMAGE_SKELETON_CLASS}`}
			style={{
				width: width ?? undefined,
				height: height ?? undefined,
				minWidth: width ? undefined : 240,
			}}
		>
			<Loader2 className="text-primary size-7 animate-spin drop-shadow-sm" />
		</span>
	)
}

function normalizeImageSrc(src: string): string {
	// Support markdown with "uploads/..." paths by converting them to site-root absolute URLs.
	if (src.startsWith('uploads/')) return `/${src}`
	return src
}

function getImageDimension(value: MdxImageProps['width'] | MdxImageProps['height']): number | undefined {
	if (typeof value === 'number') return value
	if (typeof value !== 'string') return undefined

	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) ? parsed : undefined
}

function MdxImage({ src, alt, ...props }: MdxImageProps) {
	const rawSrc = typeof src === 'string' ? src : ''
	const normalizedSrc = normalizeImageSrc(rawSrc)
	const storagePath = getStoragePathForImageSrc(normalizedSrc)
	const [resolvedSrc, setResolvedSrc] = useState<string>(() => (normalizedSrc && !storagePath ? normalizedSrc : ''))
	const [isLoaded, setIsLoaded] = useState(false)
	const width = getImageDimension(props.width)
	const height = getImageDimension(props.height)

	useEffect(() => {
		setIsLoaded(false)

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
		return <ImageLoadingPlaceholder width={width} height={height} />
	}

	return (
		<span className="relative my-2 block w-fit max-w-full">
			{!isLoaded ? <ImageLoadingPlaceholder width={width} height={height} /> : null}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				{...props}
				src={resolvedSrc}
				alt={alt ?? ''}
				className={isLoaded ? props.className : 'sr-only'}
				onLoad={(event) => {
					setIsLoaded(true)
					props.onLoad?.(event)
				}}
				onError={(event) => {
					setIsLoaded(true)
					props.onError?.(event)
				}}
			/>
		</span>
	)
}

export default function MdxRenderer({ source, className }: Props) {
	const normalized = useMemo(() => normalizeMdxSource((source ?? '').trim()), [source])
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
