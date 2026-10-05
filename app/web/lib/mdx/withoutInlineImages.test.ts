import { describe, expect, it } from 'vitest'

import { withoutInlineImages } from './withoutInlineImages'

const URI = `data:image/png;base64,${'iVBORw0KGgo'.repeat(40)}==`

describe('withoutInlineImages', () => {
	it('markdown-картинка с base64 убирается целиком', () => {
		expect(withoutInlineImages(`Что на рисунке?\n\n![схема](${URI})\n\nОтвет`)).toBe('Что на рисунке?\n\n\n\nОтвет')
	})

	it('HTML-картинка с base64 убирается, обычная картинка остаётся', () => {
		const source = `До <img src="${URI}" width="300" /> после ![файл](images/abc.webp)`
		expect(withoutInlineImages(source)).toBe('До  после ![файл](images/abc.webp)')
	})

	it('base64 вне разметки картинки тоже вырезается', () => {
		expect(withoutInlineImages(`ссылка ${URI} конец`)).toBe('ссылка  конец')
	})

	it('текст без base64 не меняется', () => {
		const source = '**Вопрос** с [ссылкой](https://example.org) и <img src="/api/docs/assets/proxy?path=a.png" />'
		expect(withoutInlineImages(source)).toBe(source)
	})
})
