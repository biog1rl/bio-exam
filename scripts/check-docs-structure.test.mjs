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

const SKILLS = ['bio-exam-web', 'bio-exam-api', 'bio-exam-data']
const REPO_PATH = /^(?:app|packages|scripts|e2e|docs)\//

function skillPaths(text) {
	return [...text.matchAll(/`([^`\s]+)`/g)]
		.map((match) => match[1].replace(/:\d+(?::\d+)?$/, ''))
		.filter((value) => REPO_PATH.test(value) && !value.includes('*'))
}

test('AGENTS.md называет все навыки проекта и каталог .agents/skills', () => {
	const agents = read('AGENTS.md')
	assert.ok(agents.includes('.agents/skills'), '.agents/skills missing in AGENTS.md')
	for (const name of SKILLS) assert.ok(agents.includes(`\`${name}\``), `skill ${name} missing in AGENTS.md`)
})

test('у каждого навыка есть SKILL.md с name, равным имени каталога', () => {
	for (const name of SKILLS) {
		const file = `.agents/skills/${name}/SKILL.md`
		assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} missing`)
		const frontmatter = /^---\n([\s\S]*?)\n---/.exec(read(file))
		assert.ok(frontmatter, `${file}: no frontmatter`)
		assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, 'm'), `${file}: name is not ${name}`)
	}
})

test('каждый путь репозитория в обратных кавычках внутри навыков существует', () => {
	for (const name of SKILLS) {
		const file = `.agents/skills/${name}/SKILL.md`
		if (!fs.existsSync(new URL(`../${file}`, import.meta.url))) assert.fail(`${file} missing`)
		const missing = skillPaths(read(file)).filter((value) => !fs.existsSync(new URL(`../${value}`, import.meta.url)))
		assert.deepEqual(missing, [], `${file}: paths do not exist`)
	}
})

test('разбор путей навыка снимает суффикс строки и пропускает шаблоны и чужие префиксы', () => {
	const text = '`app/web/proxy.ts:12` `app/server/drizzle/*.sql` `lib/session/client.ts` `yarn verify` `docs/adr`'
	assert.deepEqual(skillPaths(text), ['app/web/proxy.ts', 'docs/adr'])
})
