/**
 * Тесты политики CI (VER-03, D-24, T-1-39..T-1-41).
 * Запуск: node --test scripts/check-ci-workflow.test.mjs
 * Фикстуры строятся из настоящего .github/workflows/ci.yml с одной правкой на случай.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

import { checkCiWorkflow } from './check-ci-workflow.mjs'

const WORKFLOW = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

/** Заменяет ровно первое вхождение и падает, если фрагмента нет: фикстура не должна молча совпасть с оригиналом */
function mutate(text, from, to) {
	assert.ok(text.includes(from), `fixture anchor not found: ${from}`)
	return text.replace(from, to)
}

/** Находка, содержащая подстроку */
function hasFinding(findings, part) {
	return findings.some((finding) => finding.includes(part))
}

test('настоящий ci.yml проходит проверку', () => {
	assert.deepEqual(checkCiWorkflow(WORKFLOW), [])
})

test('без push в master: "missing: push to master"', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'branches: [master]', 'branches: [main]'))
	assert.ok(hasFinding(findings, 'missing: push to master'), findings.join('\n'))
})

test('без блока push: "missing: push to master"', () => {
	const noPush = mutate(WORKFLOW, '  push:\n    branches: [master]\n', '')
	assert.ok(hasFinding(checkCiWorkflow(noPush), 'missing: push to master'))
})

test('push не только в master отклоняется', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'branches: [master]', 'branches: [master, dev]'))
	assert.ok(hasFinding(findings, 'push'), findings.join('\n'))
})

test('права на запись в токене отклоняются', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'contents: read', 'contents: write'))
	assert.ok(hasFinding(findings, 'forbidden: ": write"'), findings.join('\n'))
	assert.ok(hasFinding(findings, 'permissions'), findings.join('\n'))
})

test('permissions шире contents: read отклоняются', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, '  contents: read\n', '  contents: read\n  issues: read\n'))
	assert.ok(hasFinding(findings, 'permissions'), findings.join('\n'))
})

test('permissions на уровне задачи отклоняются', () => {
	const findings = checkCiWorkflow(
		mutate(
			WORKFLOW,
			'  build:\n    runs-on: ubuntu-24.04\n',
			'  build:\n    runs-on: ubuntu-24.04\n    permissions:\n      contents: read\n'
		)
	)
	assert.ok(hasFinding(findings, 'job-level permissions'), findings.join('\n'))
})

test('ссылка на секрет репозитория отклоняется', () => {
	const findings = checkCiWorkflow(
		mutate(
			WORKFLOW,
			'      - name: Verify\n',
			'      - name: Verify\n        env:\n          TOKEN: ${{ secrets.SOME_TOKEN }}\n'
		)
	)
	assert.ok(hasFinding(findings, 'forbidden: "secrets."'), findings.join('\n'))
})

test('триггер в контексте цели отклоняется', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, '  pull_request:\n', '  pull_request_target:\n'))
	assert.ok(hasFinding(findings, 'forbidden: "pull_request_target"'), findings.join('\n'))
	assert.ok(hasFinding(findings, 'missing: pull_request'), findings.join('\n'))
})

test('фильтр paths у pull_request отклоняется', () => {
	const findings = checkCiWorkflow(
		mutate(WORKFLOW, '  pull_request:\n', '  pull_request:\n    paths:\n      - app/**\n')
	)
	assert.ok(hasFinding(findings, 'paths'), findings.join('\n'))
	assert.ok(hasFinding(findings, 'pull_request must have no filters'), findings.join('\n'))
})

test('шаг публикации отклоняется', () => {
	const step = '      - name: Ship\n        run: echo deploy\n'
	const findings = checkCiWorkflow(mutate(WORKFLOW, '      - name: Verify\n', `${step}      - name: Verify\n`))
	assert.ok(hasFinding(findings, 'forbidden: "deploy"'), findings.join('\n'))
})

test('упоминание CLI хостинга отклоняется', () => {
	const step = '      - name: Hosting\n        run: npx vercel --prod\n'
	const findings = checkCiWorkflow(mutate(WORKFLOW, '      - name: Verify\n', `${step}      - name: Verify\n`))
	assert.ok(hasFinding(findings, 'forbidden: "vercel"'), findings.join('\n'))
})

test('id-token и git push отклоняются', () => {
	const idToken = checkCiWorkflow(mutate(WORKFLOW, '  contents: read\n', '  contents: read\n  id-token: read\n'))
	assert.ok(hasFinding(idToken, 'forbidden: "id-token"'), idToken.join('\n'))
	const push = checkCiWorkflow(mutate(WORKFLOW, 'run: yarn verify', 'run: git push origin HEAD'))
	assert.ok(hasFinding(push, 'forbidden: "git push"'), push.join('\n'))
})

test('yarn install раньше охранника lock-файла в задаче verify отклоняется', () => {
	let text = mutate(WORKFLOW, 'run: node scripts/check-lockfile.mjs', 'run: __SLOT__')
	text = mutate(text, 'run: yarn install --immutable', 'run: node scripts/check-lockfile.mjs')
	text = mutate(text, 'run: __SLOT__', 'run: yarn install --immutable')
	const findings = checkCiWorkflow(text)
	assert.ok(hasFinding(findings, 'job verify: check-lockfile must come before yarn install'), findings.join('\n'))
})

test('шаг загрузки артефакта отклоняется', () => {
	const step = '      - uses: actions/upload-artifact@v7\n        with:\n          name: x\n          path: x\n'
	const findings = checkCiWorkflow(mutate(WORKFLOW, '      - name: Verify\n', `${step}      - name: Verify\n`))
	assert.ok(hasFinding(findings, 'forbidden: "upload-artifact"'), findings.join('\n'))
})

test('сторонний action отклоняется', () => {
	const step = '      - uses: someone/tool@v1\n'
	const findings = checkCiWorkflow(mutate(WORKFLOW, '      - name: Verify\n', `${step}      - name: Verify\n`))
	assert.ok(hasFinding(findings, 'only official actions/* are allowed'), findings.join('\n'))
})

test('checkout без persist-credentials: false отклоняется', () => {
	const findings = checkCiWorkflow(
		mutate(WORKFLOW, '          persist-credentials: false\n', '          fetch-depth: 1\n')
	)
	assert.ok(hasFinding(findings, 'persist-credentials: false'), findings.join('\n'))
})

test('команда, оставленная только в комментарии, не считается', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'run: yarn e2e', '# run: yarn e2e'))
	assert.ok(hasFinding(findings, 'job e2e: missing yarn e2e'), findings.join('\n'))
})

test('порядок checkout -> corepack -> setup-node -> install нарушен', () => {
	let text = mutate(WORKFLOW, 'run: corepack enable', 'run: __SLOT__')
	text = mutate(text, 'uses: actions/setup-node@v7', 'run: corepack enable')
	text = mutate(text, 'run: __SLOT__', 'uses: actions/setup-node@v7')
	const findings = checkCiWorkflow(text)
	assert.ok(
		hasFinding(findings, 'job verify: corepack enable must come before actions/setup-node'),
		findings.join('\n')
	)
})

test('без smoke-запуска сервера в боевом режиме отклоняется', () => {
	const noHealth = checkCiWorkflow(WORKFLOW.replaceAll('/healthz', '/x'))
	assert.ok(hasFinding(noHealth, 'job build: missing /healthz'), noHealth.join('\n'))
	const noProd = checkCiWorkflow(mutate(WORKFLOW, 'NODE_ENV: production', 'NODE_ENV: development'))
	assert.ok(hasFinding(noProd, 'job build: missing NODE_ENV: production'), noProd.join('\n'))
})

test('smoke-запуск без предшествующей сборки сервера отклоняется', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'run: yarn workspace @bio-exam/server build', 'run: echo skipped'))
	assert.ok(hasFinding(findings, 'job build: missing yarn workspace @bio-exam/server build'), findings.join('\n'))
})

test('задача без yarn install --immutable отклоняется', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, 'run: yarn install --immutable', 'run: yarn install'))
	assert.ok(hasFinding(findings, 'job verify: missing yarn install --immutable'), findings.join('\n'))
})

test('отсутствует задача e2e', () => {
	const findings = checkCiWorkflow(mutate(WORKFLOW, '  e2e:\n', '  other:\n'))
	assert.ok(hasFinding(findings, 'missing: job e2e'), findings.join('\n'))
})
