import assert from 'node:assert/strict'
import { describe, expect, it, test } from 'vitest'

import { mdxFallbackText, prepareMdxSource } from './compile'

test('normalizeMdxSource: экранирует скобку в нумерации из редактора', () => {
	const editorSource = `Вопрос:
1) увеличится
2) уменьшится
3) не изменится
Запишите ответ.

![image](image.png)`

	const normalized = prepareMdxSource(editorSource)

	assert.equal(
		normalized,
		`Вопрос:
1\\) увеличится
2\\) уменьшится
3\\) не изменится
Запишите ответ.

![image](image.png)`
	)
})

test('normalizeMdxSource: не трогает настоящие списки и уже экранированные строки', () => {
	assert.equal(prepareMdxSource('1. Настоящий список'), '1. Настоящий список')
	assert.equal(prepareMdxSource('1\\) Уже экранировано'), '1\\) Уже экранировано')
})

test('normalizeMdxSource: не трогает блоки кода', () => {
	const fencedCode = `\`\`\`text
1) строка кода
\`\`\``
	assert.equal(prepareMdxSource(fencedCode), fencedCode)
})

const URI = `data:image/png;base64,${'iVBORw0KGgo'.repeat(40)}==`

describe('mdxFallbackText', () => {
	it('markdown-картинка с base64 убирается целиком', () => {
		expect(mdxFallbackText(`Что на рисунке?\n\n![схема](${URI})\n\nОтвет`)).toBe('Что на рисунке?\n\n\n\nОтвет')
	})

	it('HTML-картинка с base64 убирается, обычная картинка остаётся', () => {
		const source = `До <img src="${URI}" width="300" /> после ![файл](images/abc.webp)`
		expect(mdxFallbackText(source)).toBe('До  после ![файл](images/abc.webp)')
	})

	it('base64 вне разметки картинки тоже вырезается', () => {
		expect(mdxFallbackText(`ссылка ${URI} конец`)).toBe('ссылка  конец')
	})

	it('текст без base64 не меняется', () => {
		const source = '**Вопрос** с [ссылкой](https://example.org) и <img src="/api/docs/assets/proxy?path=a.png" />'
		expect(mdxFallbackText(source)).toBe(source)
	})
})
