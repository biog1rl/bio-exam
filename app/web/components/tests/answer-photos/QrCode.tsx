'use client'

import { ReactQRCode } from '@lglab/react-qr-code'

export default function QrCode({ value }: { value: string }) {
	return (
		<ReactQRCode
			value={value}
			size={240}
			level="Q"
			marginSize={4}
			background="#fffdf2"
			dataModulesSettings={{ style: 'leaf', color: '#182610' }}
			finderPatternOuterSettings={{ style: 'rounded-lg', color: '#4b6b38' }}
			finderPatternInnerSettings={{ style: 'circle', color: '#4b6b38' }}
			svgProps={{ 'aria-label': 'QR-код для загрузки фото с телефона', className: 'size-56 mob:size-60' }}
		/>
	)
}
