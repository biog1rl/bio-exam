import assert from 'node:assert/strict'
import { test } from 'vitest'

import { EMOJI_ALIAS_PATTERN, createEmojiTableLoader, type EmojiEntry } from './emoji-table'

const TABLE: readonly EmojiEntry[] = [{ emoji: '😄', aliases: ['smile'], tags: ['happy'] }]

test('успешная загрузка мемоизирована: importer вызывается один раз, массив тот же', async () => {
	let calls = 0
	const loader = createEmojiTableLoader(async () => {
		calls += 1
		return { emojiList: TABLE }
	})
	assert.equal(loader.loaded(), null)
	const first = await loader.load()
	const second = await loader.load()
	assert.equal(calls, 1)
	assert.equal(first, TABLE)
	assert.equal(second, first)
	assert.equal(loader.loaded(), TABLE)
})

test('отклонённая загрузка не кэшируется: следующий вызов грузит снова', async () => {
	let calls = 0
	const loader = createEmojiTableLoader(async () => {
		calls += 1
		if (calls === 1) throw new Error('chunk load failed')
		return { emojiList: TABLE }
	})
	await assert.rejects(loader.load(), /chunk load failed/)
	assert.equal(loader.loaded(), null)
	assert.equal(await loader.load(), TABLE)
	assert.equal(calls, 2)
	assert.equal(await loader.load(), TABLE)
	assert.equal(calls, 2)
	assert.equal(loader.loaded(), TABLE)
})

test('параллельные вызовы до загрузки делят один запрос', async () => {
	let calls = 0
	const loader = createEmojiTableLoader(async () => {
		calls += 1
		return { emojiList: TABLE }
	})
	const [a, b] = await Promise.all([loader.load(), loader.load()])
	assert.equal(calls, 1)
	assert.equal(a, b)
})

test('шаблон :alias: совпадает с формой трансформера EMOJI и не хранит состояние', () => {
	assert.equal(EMOJI_ALIAS_PATTERN.flags.includes('g'), false)
	assert.equal(EMOJI_ALIAS_PATTERN.test('Привет :smile: мир'), true)
	assert.equal(EMOJI_ALIAS_PATTERN.test('Привет :smile: мир'), true)
	assert.equal(EMOJI_ALIAS_PATTERN.test('Время 10:30, без кодов'), false)
	assert.equal(EMOJI_ALIAS_PATTERN.test('Текст без эмодзи'), false)
})
