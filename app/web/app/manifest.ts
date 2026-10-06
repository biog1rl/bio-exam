import type { MetadataRoute } from 'next'

const SITE_NAME = 'bio-exam'

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: SITE_NAME,
		short_name: SITE_NAME,
		description: SITE_NAME,
		start_url: '/',
		background_color: '#ffffff',
		theme_color: '#ffffff',
		icons: [
			{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
		],
	}
}
