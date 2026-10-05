import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
	MATCHING_SCORING_CASES,
	MULTI_CHOICE_SCORING_CASES,
	SCORING_TYPES_MAP,
	SEQUENCE_SCORING_CASES,
	SHORT_TEXT_SCORING_CASES,
	SINGLE_CHOICE_SCORING_CASES,
	type ScoringCase,
} from './cases/scoring.cases'
import { scoreQuestionByType } from './scoring'

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key])
	}
	return value
}

const ALL_CASES: ScoringCase[] = [
	...SINGLE_CHOICE_SCORING_CASES,
	...MULTI_CHOICE_SCORING_CASES,
	...MATCHING_SCORING_CASES,
	...SHORT_TEXT_SCORING_CASES,
	...SEQUENCE_SCORING_CASES,
]

function frozenInputs() {
	const typesMap = deepFreeze(structuredClone(SCORING_TYPES_MAP))
	return ALL_CASES.map((row) =>
		deepFreeze({
			name: row.name,
			expected: row.expected,
			input: {
				questionType: row.typeKey,
				userAnswer: structuredClone(row.answer),
				correctAnswer: structuredClone(row.key),
				fallbackMaxPoints: 0,
				questionTypesMap: typesMap,
			},
		})
	)
}

function shuffled<T>(items: T[], seed: number): T[] {
	const out = [...items]
	let state = seed
	for (let i = out.length - 1; i > 0; i -= 1) {
		state = (state * 1103515245 + 12345) % 2147483648
		const j = state % (i + 1)
		;[out[i], out[j]] = [out[j]!, out[i]!]
	}
	return out
}

describe('чистота scoreQuestionByType', () => {
	test('замороженные входы не вызывают ошибок и дают ожидаемый результат', () => {
		const inputs = frozenInputs()
		assert.ok(inputs.length > 20)
		for (const row of inputs) {
			assert.deepEqual(scoreQuestionByType(row.input), row.expected, row.name)
		}
	})

	test('входы не мутируются: после подсчёта равны снимку до подсчёта', () => {
		const typesMap = structuredClone(SCORING_TYPES_MAP)
		const typesSnapshot = structuredClone(typesMap)
		for (const row of ALL_CASES) {
			const userAnswer = structuredClone(row.answer)
			const correctAnswer = structuredClone(row.key)
			scoreQuestionByType({
				questionType: row.typeKey,
				userAnswer,
				correctAnswer,
				fallbackMaxPoints: 0,
				questionTypesMap: typesMap,
			})
			assert.deepEqual(userAnswer, row.answer, row.name)
			assert.deepEqual(correctAnswer, row.key, row.name)
		}
		assert.deepEqual(typesMap, typesSnapshot)
	})

	test('порядок вызовов не влияет: прямой, обратный и перемешанный порядок дают одно и то же', () => {
		const inputs = frozenInputs()
		const forward = new Map(inputs.map((row) => [row.name, scoreQuestionByType(row.input)]))
		const reversed = new Map([...inputs].reverse().map((row) => [row.name, scoreQuestionByType(row.input)]))
		for (const seed of [1, 7, 42]) {
			for (const row of shuffled(inputs, seed)) {
				assert.deepEqual(scoreQuestionByType(row.input), forward.get(row.name), `${row.name} seed ${seed}`)
			}
		}
		assert.deepEqual(reversed, forward)
	})

	test('параллельные вызовы через Promise.all дают тот же результат, что и последовательные', async () => {
		const inputs = frozenInputs()
		const sequential = inputs.map((row) => scoreQuestionByType(row.input))
		const parallel = await Promise.all(
			shuffled(
				inputs.map((row, index) => ({ row, index })),
				99
			).map(async ({ row, index }) => ({ index, result: scoreQuestionByType(row.input) }))
		)
		for (const { index, result } of parallel) {
			assert.deepEqual(result, sequential[index])
		}
	})
})
