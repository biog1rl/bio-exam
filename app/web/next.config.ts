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
	allowedDevOrigins: ['172.18.0.1', '192.168.50.2', 'localhost'],
	pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
	experimental: {
		scrollRestoration: true,
		turbopackFileSystemCacheForDev: true,
		proxyClientMaxBodySize: '12mb',
	},

	async headers() {
		const phoneUploadHeaders = [
			{ key: 'Referrer-Policy', value: 'no-referrer' },
			{ key: 'X-Robots-Tag', value: 'noindex, nofollow' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
		]
		return [
			{ source: '/photo-upload', headers: phoneUploadHeaders },
			{ source: '/photo-upload/:path*', headers: phoneUploadHeaders },
		]
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
			beforeFiles: [{ source: '/api/:path*', destination: to('/api/:path*') }],
			afterFiles: [],
			fallback: [],
		}
	},
})

export default nextConfig
