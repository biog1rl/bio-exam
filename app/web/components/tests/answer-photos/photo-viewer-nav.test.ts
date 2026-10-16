import { describe, expect, test } from 'vitest'

import { stepIndex, swipeDelta } from './photo-viewer-nav'

describe('stepIndex', () => {
	test('не выходит за границы и не листает по кругу', () => {
		expect(stepIndex(0, -1, 3)).toBe(0)
		expect(stepIndex(2, 1, 3)).toBe(2)
		expect(stepIndex(1, 1, 3)).toBe(2)
		expect(stepIndex(1, -1, 3)).toBe(0)
		expect(stepIndex(0, 1, 1)).toBe(0)
	})
})

describe('swipeDelta', () => {
	test.each([
		{ name: 'влево быстро — следующее', gesture: { dx: -80, dy: 5, durationMs: 200 }, expected: 1 },
		{ name: 'вправо быстро — предыдущее', gesture: { dx: 80, dy: 5, durationMs: 200 }, expected: -1 },
		{ name: 'ровно 60 px — не свайп', gesture: { dx: -60, dy: 0, durationMs: 100 }, expected: 0 },
		{ name: 'медленно — не свайп', gesture: { dx: -120, dy: 0, durationMs: 501 }, expected: 0 },
		{ name: 'больше по вертикали — не свайп', gesture: { dx: -70, dy: 90, durationMs: 100 }, expected: 0 },
	])('$name', ({ gesture, expected }) => {
		expect(swipeDelta(gesture)).toBe(expected)
	})
})
