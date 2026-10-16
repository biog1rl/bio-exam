import { ReactQRCode } from '@lglab/react-qr-code'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const CARD = '#fffdf2'
const FOREGROUND = '#182610'
const PRIMARY = '#4b6b38'
const SIZES = [240, 224, 200]

const VARIANTS = [
	{
		title: 'основной вид: точки leaf, глазки rounded-lg и circle',
		dataStyle: 'leaf',
		outerStyle: 'rounded-lg',
	},
	{
		title: 'запасной вид: точки circle, глазки circle и circle',
		dataStyle: 'circle',
		outerStyle: 'circle',
	},
]

function qrCode(url, size, variant) {
	return h(ReactQRCode, {
		value: url,
		size,
		level: 'Q',
		marginSize: 4,
		background: CARD,
		dataModulesSettings: { style: variant.dataStyle, color: FOREGROUND },
		finderPatternOuterSettings: { style: variant.outerStyle, color: PRIMARY },
		finderPatternInnerSettings: { style: 'circle', color: PRIMARY },
		svgProps: { 'aria-label': 'QR-код для загрузки фото с телефона' },
	})
}

function page(url) {
	return h(
		'html',
		{ lang: 'ru' },
		h(
			'head',
			null,
			h('meta', { charSet: 'utf-8' }),
			h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
			h('meta', { name: 'referrer', content: 'no-referrer' }),
			h('meta', { name: 'robots', content: 'noindex, nofollow' }),
			h('title', null, 'QR-лист спайка фазы 13'),
			h(
				'style',
				null,
				`body{margin:0;padding:24px;background:${CARD};color:${FOREGROUND};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}h1{font-size:20px;margin:0 0 8px}h2{font-size:16px;margin:24px 0 12px}.row{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}figure{margin:0}figcaption{margin-top:8px;font-size:13px;font-variant-numeric:tabular-nums}.url{font-family:ui-monospace,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}`,
			),
		),
		h(
			'body',
			null,
			h('h1', null, 'QR-лист спайка фазы 13'),
			h('p', { className: 'url' }, url),
			...VARIANTS.map((variant) =>
				h(
					'section',
					{ key: variant.dataStyle },
					h('h2', null, variant.title),
					h(
						'div',
						{ className: 'row' },
						...SIZES.map((size) =>
							h(
								'figure',
								{ key: size },
								qrCode(url, size, variant),
								h(
									'figcaption',
									{ style: { maxWidth: `${size}px` } },
									h('div', null, `${variant.dataStyle}/${variant.outerStyle}, ${size} px`),
									h('div', { className: 'url' }, url),
								),
							),
						),
					),
				),
			),
		),
	)
}

export function renderQrPage(origin, token) {
	const url = `${origin}/spike.html#${token}`
	return `<!doctype html>${renderToStaticMarkup(page(url))}`
}
