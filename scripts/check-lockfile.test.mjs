/**
 * Тесты охранника единственного lock-файла (VER-04, T-1-18).
 * Запуск: node --test scripts/check-lockfile.test.mjs
 * Git и файловая система не нужны: список путей и проверка существования передаются явно.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { existingPaths, findLockfileViolations } from './check-lockfile.mjs'

test('чистое дерево с корневым yarn.lock проходит', () => {
	assert.deepEqual(findLockfileViolations(['yarn.lock', 'app/web/package.json']), [])
})

test('корневой package-lock.json запрещён', () => {
	assert.deepEqual(findLockfileViolations(['yarn.lock', 'package-lock.json']), ['package-lock.json'])
})

test('вложенные lock-файлы возвращаются отсортированными', () => {
	assert.deepEqual(findLockfileViolations(['yarn.lock', 'packages/rbac/pnpm-lock.yaml', 'app/web/package-lock.json']), [
		'app/web/package-lock.json',
		'packages/rbac/pnpm-lock.yaml',
	])
})

test('bun.lockb, npm-shrinkwrap.json и bun.lock запрещены', () => {
	assert.deepEqual(findLockfileViolations(['yarn.lock', 'bun.lockb', 'npm-shrinkwrap.json', 'bun.lock']), [
		'bun.lock',
		'bun.lockb',
		'npm-shrinkwrap.json',
	])
})

test('отсутствие корневого yarn.lock сообщается', () => {
	const violations = findLockfileViolations(['app/web/package.json'])
	assert.equal(violations.length, 1)
	assert.match(violations[0], /^missing: yarn\.lock/)
})

test('yarn.lock во вложенной папке не заменяет корневой', () => {
	const violations = findLockfileViolations(['app/web/yarn.lock'])
	assert.equal(violations.length, 1)
	assert.match(violations[0], /^missing: yarn\.lock/)
})

test('совпадение только по точному имени файла', () => {
	assert.deepEqual(
		findLockfileViolations(['yarn.lock', 'docs/package-lock.json.md', 'docs/my-package-lock.json', 'bun.lockfile']),
		[]
	)
})

test('existingPaths: tracked-файл, удалённый с диска и не добавленный в индекс, не нарушение', () => {
	const kept = existingPaths(['yarn.lock', 'package-lock.json'], (p) => p === 'yarn.lock')
	assert.deepEqual(kept, ['yarn.lock'])
	assert.deepEqual(findLockfileViolations(kept), [])
})

test('existingPaths: lock-файл, который есть на диске, по-прежнему нарушение', () => {
	const kept = existingPaths(['yarn.lock', 'package-lock.json'], () => true)
	assert.deepEqual(kept, ['yarn.lock', 'package-lock.json'])
	assert.deepEqual(findLockfileViolations(kept), ['package-lock.json'])
})

test('existingPaths: удалённый yarn.lock всё равно ловится', () => {
	const kept = existingPaths(['yarn.lock'], (p) => p !== 'yarn.lock')
	assert.deepEqual(kept, [])
	const violations = findLockfileViolations(kept)
	assert.equal(violations.length, 1)
	assert.match(violations[0], /^missing: yarn\.lock/)
})
