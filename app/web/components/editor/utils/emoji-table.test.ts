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

test.each(
	(
		[
			{
				name: 'совпадает с формой трансформера EMOJI и не хранит состояние',
				cases: [
					['Привет :smile: мир', true],
					['Привет :smile: мир', true],
					['Время 10:30, без кодов', false],
					['Текст без эмодзи', false],
				],
			},
			{
				name: 'требует букву: цифровые соотношения не считаются алиасом',
				cases: [
					['Соотношение 1:100:1', false],
					['Расщепление 9:3:3:1', false],
					['Код :1234: без букв', false],
					['Медаль :1st_place_medal:', true],
					['Привет :smile:', true],
				],
			},
		] as { name: string; cases: [string, boolean][] }[]
	).map((row): [string, { name: string; cases: [string, boolean][] }] => [row.name, row])
)('шаблон :alias: %s', (_name, { cases }) => {
	assert.equal(EMOJI_ALIAS_PATTERN.flags.includes('g'), false)
	for (const [text, expected] of cases) assert.equal(EMOJI_ALIAS_PATTERN.test(text), expected, text)
})
