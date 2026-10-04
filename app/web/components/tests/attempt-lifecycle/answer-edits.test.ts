import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { setMatchingPair, toggleOption } from './answer-edits'

describe('toggleOption', () => {
	test('добавляет и снимает вариант, не массив считается пустым', () => {
		assert.deepEqual(toggleOption(undefined, 'a'), ['a'])
		assert.deepEqual(toggleOption(['a', 'b'], 'a'), ['b'])
		assert.deepEqual(toggleOption(['a'], 'b'), ['a', 'b'])
		assert.deepEqual(toggleOption('a', 'b'), ['b'])
		assert.deepEqual(toggleOption({ l1: 'r1' }, 'b'), ['b'])
	})

	test('исходный массив не меняется', () => {
		const current = ['a']
		toggleOption(current, 'b')
		assert.deepEqual(current, ['a'])
	})
})

describe('setMatchingPair', () => {
	test('новая запись пар без изменения исходной', () => {
		assert.deepEqual(setMatchingPair(undefined, 'l1', 'r1'), { l1: 'r1' })
		const current = { l1: 'r1' }
		assert.deepEqual(setMatchingPair(current, 'l2', 'r2'), { l1: 'r1', l2: 'r2' })
		assert.deepEqual(current, { l1: 'r1' })
		assert.deepEqual(setMatchingPair(current, 'l1', 'r3'), { l1: 'r3' })
	})

	test('строка и массив считаются пустой записью', () => {
		assert.deepEqual(setMatchingPair('x', 'l1', 'r1'), { l1: 'r1' })
		assert.deepEqual(setMatchingPair(['x'], 'l1', 'r1'), { l1: 'r1' })
	})
})
