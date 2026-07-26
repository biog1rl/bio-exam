import assert from 'node:assert/strict'

import { normalizeMdxSource } from './normalizeSource'

const editorSource = `Вопрос:
1) увеличится
2)\u00a0уменьшится
3)\u00a0не изменится
Запишите ответ.

![image](image.png)`

const normalized = normalizeMdxSource(editorSource)

assert.equal(
	normalized,
	`Вопрос:
1\\) увеличится
2\\)\u00a0уменьшится
3\\)\u00a0не изменится
Запишите ответ.

![image](image.png)`
)

assert.equal(normalizeMdxSource('1. Настоящий список'), '1. Настоящий список')
assert.equal(normalizeMdxSource('1\\) Уже экранировано'), '1\\) Уже экранировано')
const fencedCode = `\`\`\`text
1) строка кода
\`\`\``
assert.equal(normalizeMdxSource(fencedCode), fencedCode)
