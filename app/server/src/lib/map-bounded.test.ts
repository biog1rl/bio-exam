import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { mapBounded } from './map-bounded.js'

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('mapBounded', () => {
	test('20 задач с разными задержками и потолком 6: не больше 6 одновременно, результат в порядке входа', async () => {
		const items = Array.from({ length: 20 }, (_, index) => index)
		let inFlight = 0
		let maxInFlight = 0
		const result = await mapBounded(items, 6, async (item, index) => {
			assert.equal(item, index)
			inFlight += 1
			maxInFlight = Math.max(maxInFlight, inFlight)
			await sleep(((item * 7) % 5) * 3 + 1)
			inFlight -= 1
			return `r${item}`
		})
		assert.equal(maxInFlight, 6)
		assert.deepEqual(
			result,
			items.map((item) => `r${item}`)
		)
	})

	test('ошибка третьей задачи отклоняет результат этой ошибкой, новые задачи не начинаются', async () => {
		const items = Array.from({ length: 20 }, (_, index) => index)
		const failure = new Error('третья задача')
		const started: number[] = []
		await assert.rejects(
			mapBounded(items, 6, async (item) => {
				started.push(item)
				if (item === 2) {
					await sleep(5)
					throw failure
				}
				await sleep(40)
				return item
			}),
			(error: unknown) => error === failure
		)
		await sleep(80)
		assert.deepEqual(
			[...started].sort((a, b) => a - b),
			[0, 1, 2, 3, 4, 5]
		)
	})

	test('пустой вход: пустой массив без вызовов', async () => {
		let calls = 0
		const result = await mapBounded([], 6, async () => {
			calls += 1
			return 1
		})
		assert.deepEqual(result, [])
		assert.equal(calls, 0)
	})

	test('потолок больше числа задач: все задачи сразу, порядок входа', async () => {
		let inFlight = 0
		let maxInFlight = 0
		const result = await mapBounded([3, 1, 2], 10, async (item) => {
			inFlight += 1
			maxInFlight = Math.max(maxInFlight, inFlight)
			await sleep(item * 3)
			inFlight -= 1
			return item * 10
		})
		assert.equal(maxInFlight, 3)
		assert.deepEqual(result, [30, 10, 20])
	})

	test('недопустимый потолок отклоняется', async () => {
		await assert.rejects(
			mapBounded([1], 0, async (item) => item),
			RangeError
		)
		await assert.rejects(
			mapBounded([1], 1.5, async (item) => item),
			RangeError
		)
	})
})
