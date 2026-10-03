import assert from 'node:assert/strict'
import { test } from 'vitest'

import { normalizeMdxSource } from './normalizeSource'

test('normalizeMdxSource: экранирует скобку в нумерации из редактора', () => {
	const editorSource = `Вопрос:
1) увеличится
2) уменьшится
3) не изменится
Запишите ответ.

![image](image.png)`

	const normalized = normalizeMdxSource(editorSource)

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
	assert.equal(normalizeMdxSource('1. Настоящий список'), '1. Настоящий список')
	assert.equal(normalizeMdxSource('1\\) Уже экранировано'), '1\\) Уже экранировано')
})

test('normalizeMdxSource: не трогает блоки кода', () => {
	const fencedCode = `\`\`\`text
1) строка кода
\`\`\``
	assert.equal(normalizeMdxSource(fencedCode), fencedCode)
})
