import { describe, expect, it } from 'vitest'

import { questionPreview } from './question-preview'

describe('questionPreview', () => {
	it('markdown-картинка не попадает в текст превью, имя файла не показывается', () => {
		const prompt =
			'тест краткого ответа 1\n\n![bdb7c20c578bb0048f99bdc1f0a1.png](/api/docs/assets/proxy?path=topics%2Fbio%2Fbdb7c20c578bb0048f99bdc1f0a1.png)'
		expect(questionPreview(prompt)).toEqual({ text: 'тест краткого ответа 1', truncated: false, hasImage: true })
	})

	it('HTML-картинка с размерами тоже убирается', () => {
		const prompt =
			'Рассмотрите схему <img src="/api/docs/assets/proxy?path=a.png" width="300" height="200" /> и ответьте'
		expect(questionPreview(prompt)).toEqual({ text: 'Рассмотрите схему и ответьте', truncated: false, hasImage: true })
	})

	it('у ссылки остаётся текст, разметка и лишние пробелы убираются', () => {
		expect(questionPreview('## Вопрос\n\n**Какая** _органелла_ см. [учебник](https://example.org)?')).toEqual({
			text: 'Вопрос Какая органелла см. учебник?',
			truncated: false,
			hasImage: false,
		})
	})

	it('вопрос только из картинки даёт пустой текст и признак картинки', () => {
		expect(questionPreview('![схема](/api/docs/assets/proxy?path=b.png)')).toEqual({
			text: '',
			truncated: false,
			hasImage: true,
		})
	})

	it('длинный текст обрезается по длине очищенного текста', () => {
		const result = questionPreview(`${'а'.repeat(30)} ![x](/u.png) ${'б'.repeat(30)}`, 40)
		expect(result.truncated).toBe(true)
		expect(result.text).toBe(`${'а'.repeat(30)} ${'б'.repeat(9)}`)
		expect(questionPreview('коротко', 40).truncated).toBe(false)
	})
})
