/**
 * Структура документации не расходится с кодом (VER-07).
 * Запуск: node --test scripts/check-docs-structure.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

import { STEPS } from './verify.mjs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

/** Раздел README «Проверка: `yarn verify`» до следующего заголовка второго уровня */
function readmeVerifySection() {
	const readme = read('README.md')
	const start = readme.indexOf('## Проверка: `yarn verify`')
	assert.ok(start >= 0, 'README verify section not found')
	const rest = readme.slice(start + 1)
	const next = rest.search(/\n## /)
	return next < 0 ? rest : rest.slice(0, next)
}

test('README перечисляет каждый шаг yarn verify по порядку', () => {
	const section = readmeVerifySection()
	let from = 0
	for (const { name } of STEPS) {
		const index = section.indexOf(`\`${name}\``, from)
		assert.ok(index >= 0, `step ${name} missing or out of order in README verify section`)
		from = index
	}
})

test('AGENTS.md называет каждый шаг yarn verify', () => {
	const agents = read('AGENTS.md')
	for (const { name } of STEPS) assert.ok(agents.includes(`\`${name}\``), `step ${name} missing in AGENTS.md`)
})

test('AGENTS.md содержит разделы CodeGraph и Project commands', () => {
	const agents = read('AGENTS.md')
	assert.match(agents, /^## CodeGraph$/m)
	assert.match(agents, /^## Project commands$/m)
})

test('CLAUDE.md состоит только из @AGENTS.md', () => {
	assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md')
})

test('app/server/README.md называет все пять шаблонов вопросов', () => {
	const readme = read('app/server/README.md')
	for (const id of ['single_choice', 'multi_choice', 'matching', 'short_text', 'sequence_digits']) {
		assert.ok(readme.includes(`\`${id}\``), `template ${id} missing in app/server/README.md`)
	}
})
