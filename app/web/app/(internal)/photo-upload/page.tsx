import type { Metadata, Viewport } from 'next'

import PhotoUploadClient from './PhotoUploadClient'

export const metadata: Metadata = {
	title: 'Фото к ответу',
	referrer: 'no-referrer',
	robots: { index: false, follow: false },
}

export const viewport: Viewport = { viewportFit: 'cover' }

export default function PhotoUploadPage() {
	return <PhotoUploadClient />
}
