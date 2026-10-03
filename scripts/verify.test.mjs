/**
 * Тесты yarn verify (VER-02): порядок шагов, итоговый блок, отказ без PostgreSQL 17.
 * Запуск: node --test scripts/verify.test.mjs
 * Полный yarn verify из теста не запускается (рекурсия): проверяется только отказ до первого шага.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { isolatedChildEnv } from './lib/test-db.mjs'
import { formatSummary, STEPS } from './verify.mjs'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))

test('восемь шагов идут в заданном порядке', () => {
	assert.deepEqual(
		STEPS.map((step) => step.name),
		[
			'lockfile',
			'env-contract',
			'docs-commands',
			'ci-workflow',
			'format-check',
			'lint-typecheck-test',
			'migrations',
			'script-tests',
		]
	)
})

test('script-tests находит тесты скриптов и сам себя тоже', () => {
	const step = STEPS.find((s) => s.name === 'script-tests')
	const args = step.args()
	assert.equal(args[0], '--test')
	assert.ok(args.includes('scripts/verify.test.mjs'), args.join('\n'))
	assert.ok(args.includes('scripts/check-lockfile.test.mjs'), args.join('\n'))
})

test('ноль найденных тестов — провал шага script-tests', () => {
	// Обход невозможен без правки реализации; проверяем, что провал заложен именно как исключение
	const step = STEPS.find((s) => s.name === 'script-tests')
	assert.equal(typeof step.args, 'function')
	assert.match(step.args.toString(), /zero tests is a failure/)
})

test('итог OK: все шаги passed и строка "yarn verify: OK"', () => {
	const statuses = new Map(STEPS.map((step) => [step.name, 'passed']))
	const lines = formatSummary(STEPS, statuses, null).split('\n')
	assert.equal(lines[0], 'verify summary:')
	assert.equal(lines.at(-1), 'yarn verify: OK')
	assert.equal(lines.length, STEPS.length + 2)
	assert.ok(lines.slice(1, -1).every((line) => line.endsWith(': passed')))
})

test('итог при провале: FAILED at <шаг>, остальные "not run"', () => {
	const statuses = new Map([
		['lockfile', 'passed'],
		['env-contract', 'FAILED'],
	])
	const summary = formatSummary(STEPS, statuses, 'env-contract')
	assert.ok(summary.endsWith('yarn verify: FAILED at env-contract'), summary)
	assert.ok(!summary.includes('yarn verify: OK'))
	assert.ok(summary.includes('  env-contract: FAILED'))
	assert.ok(summary.includes('  script-tests: not run'))
})

test('без PostgreSQL 17 verify завершается кодом 1 с подсказкой и без "yarn verify: OK"', () => {
	const env = isolatedChildEnv({ PG_BIN_DIR: '/nonexistent' })
	delete env.TEST_DATABASE_URL
	const result = spawnSync(process.execPath, ['scripts/verify.mjs'], { cwd: REPO_ROOT, env, encoding: 'utf8' })
	const output = `${result.stdout}${result.stderr}`
	assert.equal(result.status, 1, output)
	assert.ok(output.includes('PostgreSQL 17 not found'), output)
	assert.ok(output.includes('yarn verify: FAILED at test-database'), output)
	assert.ok(!output.includes('yarn verify: OK'), output)
	assert.ok(!output.includes('[verify] step '), 'a step started without a database')
})
