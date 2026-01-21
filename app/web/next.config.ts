import withMDX from '@next/mdx'

import type { NextConfig } from 'next'

const withMdx = withMDX({
	extension: /\.mdx?$/,
	options: {
		remarkPlugins: [],
		rehypePlugins: [],
		providerImportSource: '@mdx-js/react',
	},
})

const nextConfig: NextConfig = withMdx({
	pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
	experimental: {
		scrollRestoration: true,
		turbopackFileSystemCacheForDev: true,
	},

	async rewrites() {
		const API_ORIGIN = process.env.API_ORIGIN
		console.log('[next.config] API_ORIGIN:', API_ORIGIN)
		if (!API_ORIGIN) {
			console.warn('[next.config] API_ORIGIN is not set — rewrites will be empty')
			return { beforeFiles: [], afterFiles: [], fallback: [] }
		}
		const to = (p: string) => `${API_ORIGIN}${p}`

		return {
			beforeFiles: [
				{ source: '/api/:path*', destination: to('/api/:path*') },
				{ source: '/uploads/:path*', destination: to('/uploads/:path*') },
			],
			afterFiles: [],
			fallback: [],
		}
	},
})

export default nextConfig
