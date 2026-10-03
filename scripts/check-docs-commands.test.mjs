/**
 * Тесты проверки команд в документации (VER-07): содержимое файлов и карты скриптов задаются в памяти,
 * файловая система и git не нужны.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkDocsCommands, extractYarnCommands } from './check-docs-commands.mjs'

const PACKAGES = {
	root: {
		scripts: { verify: 'node scripts/verify.mjs', e2e: 'node scripts/e2e.mjs', lint: 'turbo run lint', dev: 'x' },
		bins: ['turbo', 'oxfmt', 'playwright'],
	},
	workspaces: {
		'@bio-exam/server': { scripts: { 'drizzle:migrate': 'x', test: 'vitest run' } },
		'@bio-exam/web': { scripts: { dev: 'next dev' } },
	},
}

const GOOD_README = 'Запуск: `yarn verify`, затем `yarn e2e`.\n'

function run(files, packages = PACKAGES) {
	return checkDocsCommands({ files, packages }).map((item) => item.message)
}

test('known root scripts pass; unknown script is reported with file and line', () => {
	const readme = `${GOOD_README}Строка\n\`yarn nope\`\n`
	assert.deepEqual(run({ 'README.md': readme, 'app/server/README.md': '', 'AGENTS.md': '' }), [
		'README.md:3: unknown script nope',
	])
})

test('yarn workspace resolves only against that workspace package.json', () => {
	const ok = '```bash\nyarn workspace @bio-exam/server drizzle:migrate\n```\n'
	assert.deepEqual(run({ 'README.md': GOOD_README + ok, 'app/server/README.md': '', 'AGENTS.md': '' }), [])

	const wrong = '`yarn workspace @bio-exam/web drizzle:migrate`\n'
	assert.deepEqual(run({ 'README.md': GOOD_README + wrong, 'app/server/README.md': '', 'AGENTS.md': '' }), [
		'README.md:2: unknown script drizzle:migrate in workspace @bio-exam/web',
	])

	const unknown = '`yarn workspace @bio-exam/nope test`\n'
	assert.deepEqual(run({ 'README.md': GOOD_README + unknown, 'app/server/README.md': '', 'AGENTS.md': '' }), [
		'README.md:2: unknown workspace @bio-exam/nope',
	])
})

test('yarn built-ins and binaries of root devDependencies pass', () => {
	const text = [
		GOOD_README,
		'`yarn install` `yarn add x` `yarn remove x` `yarn dlx x` `yarn why x` `yarn npm audit` `yarn constraints`',
		'`yarn workspaces foreach -A run test`',
		'`yarn turbo run lint` `yarn oxfmt --check .` `yarn playwright install chromium`',
	].join('\n')
	assert.deepEqual(run({ 'README.md': text, 'app/server/README.md': '', 'AGENTS.md': '' }), [])
})

test('README.md without yarn verify or yarn e2e is an error', () => {
	const result = run({ 'README.md': 'Только `yarn lint`.\n', 'app/server/README.md': '', 'AGENTS.md': '' })
	assert.deepEqual(result, ['README.md: must mention yarn verify', 'README.md: must mention yarn e2e'])
	assert.deepEqual(run({ 'README.md': 'Запуск: `yarn verify`.\n', 'app/server/README.md': '', 'AGENTS.md': '' }), [
		'README.md: must mention yarn e2e',
	])
})

test('a missing required doc file is an error; a doc without yarn commands passes unless it is README.md', () => {
	assert.deepEqual(run({ 'README.md': GOOD_README, 'AGENTS.md': 'Нет команд.\n' }), [
		'app/server/README.md: missing file',
	])
	assert.deepEqual(run({ 'README.md': GOOD_README, 'app/server/README.md': 'Нет команд.\n', 'AGENTS.md': '' }), [])
	assert.deepEqual(run({ 'app/server/README.md': '', 'AGENTS.md': '' }), ['README.md: missing file'])
})

test('findings are ordered by file (README.md, app/server/README.md, AGENTS.md) then line', () => {
	const files = {
		'AGENTS.md': '`yarn zz`\n\n`yarn aa`\n',
		'app/server/README.md': '`yarn mm`\n',
		'README.md': `${GOOD_README}\n\`yarn bb\`\n\`yarn aa\`\n`,
	}
	assert.deepEqual(run(files), [
		'README.md:3: unknown script bb',
		'README.md:4: unknown script aa',
		'app/server/README.md:1: unknown script mm',
		'AGENTS.md:1: unknown script zz',
		'AGENTS.md:3: unknown script aa',
	])
	assert.deepEqual(run(files), run(files))
})

test('extractYarnCommands: fences, inline code, prompts, comments, chained and wrapped commands', () => {
	const text = [
		'Проза с yarn install вне кода не считается.',
		'```bash',
		'$ yarn dev   # запуск',
		'node scripts/with-test-db.mjs yarn workspace @bio-exam/server test',
		'yarn lint && yarn verify',
		'```',
		'Файл `yarn.lock` и `yarn verify: OK` и `yarn ...`.',
		'`yarn e2e --grep @flow1`',
	].join('\n')
	assert.deepEqual(
		extractYarnCommands(text).map(({ line, args }) => [line, args.join(' ')]),
		[
			[3, 'dev'],
			[4, 'workspace @bio-exam/server test'],
			[5, 'lint'],
			[5, 'verify'],
			[7, 'verify: OK'],
			[7, '...'],
			[8, 'e2e --grep @flow1'],
		]
	)
})

test('trailing punctuation after a script name and unusual arguments do not produce false errors', () => {
	const text = `${GOOD_README}\`yarn verify: OK\` \`yarn ...\` \`yarn --version\` \`yarn verify.\`\n`
	assert.deepEqual(run({ 'README.md': text, 'app/server/README.md': '', 'AGENTS.md': '' }), [])
})
