import { createEditor, type LexicalEditor } from 'lexical'
import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

import { nodes } from '@/components/editor/nodes'

import type { EmojiEntry } from './emoji-table'
import { editorStateToMdx, mdxToEditorState } from './mdx-converter'

const table = vi.hoisted(() => ({
	load: vi.fn<() => Promise<readonly EmojiEntry[]>>(),
	loaded: vi.fn<() => readonly EmojiEntry[] | null>(),
}))

vi.mock('@/components/editor/utils/emoji-table', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	loadEmojiTable: table.load,
	getLoadedEmojiTable: table.loaded,
}))

const SMILE: readonly EmojiEntry[] = [{ emoji: '😄', aliases: ['smile'], tags: ['happy'] }]

beforeEach(() => {
	table.load.mockReset()
	table.loaded.mockReset()
	table.loaded.mockReturnValue(null)
})

function newEditor(): { editor: LexicalEditor; contentUpdates: () => number } {
	const editor = createEditor({
		namespace: 'mdx-emoji-load',
		nodes: [...nodes],
		onError: (error) => {
			throw error
		},
	})
	let count = 0
	editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
		if (dirtyElements.size > 0 || dirtyLeaves.size > 0) count += 1
	})
	return { editor, contentUpdates: () => count }
}

function mdxOf(editor: LexicalEditor): string {
	return editor.getEditorState().read(editorStateToMdx)
}

test('сбой загрузки таблицы: конвертация разрешается, :alias: остаётся текстом, одно обновление', async () => {
	table.load.mockRejectedValue(new Error('chunk load failed'))
	const { editor, contentUpdates } = newEditor()
	await mdxToEditorState(editor, 'Привет :smile: мир')
	assert.equal(table.load.mock.calls.length, 1)
	assert.equal(mdxOf(editor), 'Привет :smile: мир')
	assert.equal(contentUpdates(), 1)
})

test('MDX без :alias: не ждёт таблицу и не запрашивает её', async () => {
	table.load.mockReturnValue(new Promise<readonly EmojiEntry[]>(() => {}))
	const { editor, contentUpdates } = newEditor()
	await mdxToEditorState(editor, 'Текст без эмодзи')
	assert.equal(table.load.mock.calls.length, 0)
	assert.equal(mdxOf(editor), 'Текст без эмодзи')
	assert.equal(contentUpdates(), 1)
})

test('загруженная таблица: :alias: заменяется символом без повторной загрузки', async () => {
	table.loaded.mockReturnValue(SMILE)
	const { editor } = newEditor()
	await mdxToEditorState(editor, 'Привет :smile: мир')
	assert.equal(table.load.mock.calls.length, 0)
	assert.equal(mdxOf(editor), 'Привет 😄 мир')
})

test('таблица грузится для MDX с :alias: и заменяет код символом', async () => {
	table.load.mockImplementation(async () => {
		table.loaded.mockReturnValue(SMILE)
		return SMILE
	})
	const { editor, contentUpdates } = newEditor()
	await mdxToEditorState(editor, 'Привет :smile: мир')
	assert.equal(table.load.mock.calls.length, 1)
	assert.equal(mdxOf(editor), 'Привет 😄 мир')
	assert.equal(contentUpdates(), 1)
})

test('устаревшая конвертация после загрузки таблицы не перезаписывает более новую', async () => {
	let release: (value: readonly EmojiEntry[]) => void = () => {}
	table.load.mockReturnValue(
		new Promise<readonly EmojiEntry[]>((resolve) => {
			release = resolve
		})
	)
	const { editor } = newEditor()
	const stale = mdxToEditorState(editor, 'Старый :smile: текст')
	await mdxToEditorState(editor, 'Новый текст')
	table.loaded.mockReturnValue(SMILE)
	release(SMILE)
	await stale
	assert.equal(mdxOf(editor), 'Новый текст')
})

const NUMERIC: readonly EmojiEntry[] = [
	{ emoji: '💯', aliases: ['100'], tags: ['score'] },
	{ emoji: '🔢', aliases: ['1234'], tags: ['numbers'] },
	{ emoji: '😄', aliases: ['smile'], tags: ['happy'] },
]

for (const text of ['Соотношение 1:100:1', 'Расщепление 9:3:3:1', 'Код :1234: без букв']) {
	test(`цифровое соотношение «${text}» не ждёт таблицу и не меняется`, async () => {
		table.load.mockReturnValue(new Promise<readonly EmojiEntry[]>(() => {}))
		const { editor } = newEditor()
		await mdxToEditorState(editor, text)
		assert.equal(table.load.mock.calls.length, 0)
		assert.equal(mdxOf(editor), text)
	})

	test(`цифровое соотношение «${text}» не меняется и при загруженной таблице с цифровыми алиасами`, async () => {
		table.loaded.mockReturnValue(NUMERIC)
		const { editor } = newEditor()
		await mdxToEditorState(editor, text)
		assert.equal(mdxOf(editor), text)
	})
}

test(':smile: рядом с цифровым соотношением превращается в символ', async () => {
	table.loaded.mockReturnValue(NUMERIC)
	const { editor } = newEditor()
	await mdxToEditorState(editor, 'Соотношение 1:100:1 :smile:')
	assert.equal(mdxOf(editor), 'Соотношение 1:100:1 😄')
})
