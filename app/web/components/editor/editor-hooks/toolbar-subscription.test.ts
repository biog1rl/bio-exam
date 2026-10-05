import type { ReactElement } from 'react'

import { COMMAND_PRIORITY_CRITICAL, SELECTION_CHANGE_COMMAND, type BaseSelection, type LexicalEditor } from 'lexical'
import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'

import { ToolbarContext } from '@/components/editor/context/toolbar-context'
import { ToolbarPlugin } from '@/components/editor/plugins/toolbar/toolbar-plugin'
import { createHarness } from '@/test-support/fake-react'

import { subscribeToolbar, type ToolbarEditorLike } from './toolbar-subscription'
import { useUpdateToolbarHandler } from './use-update-toolbar'

const world = vi.hoisted(() => ({
	selection: null as unknown,
	activeEditor: null as unknown,
	composerEditor: null as unknown,
}))

vi.mock('react', async (importOriginal) =>
	(await import('@/test-support/fake-react')).mockReact(await importOriginal<Record<string, unknown>>())
)

vi.mock('lexical', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	$getSelection: () => world.selection,
}))

vi.mock('@/components/editor/context/toolbar-context', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useToolbarContext: () => ({ activeEditor: world.activeEditor }),
}))

vi.mock('@lexical/react/LexicalComposerContext', () => ({
	useLexicalComposerContext: () => [world.composerEditor],
}))

type Registration = { command: unknown; listener: (payload: unknown, editor: unknown) => boolean; priority: number }

function fakeEditor(name: string) {
	const registrations = new Set<Registration>()
	const stats = { registers: 0, unregisters: 0, reads: 0 }
	const editor = {
		name,
		registerCommand(command: unknown, listener: Registration['listener'], priority: number) {
			stats.registers++
			const registration = { command, listener, priority }
			registrations.add(registration)
			return () => {
				if (registrations.delete(registration)) stats.unregisters++
			}
		},
		getEditorState() {
			return {
				read(callback: () => void) {
					stats.reads++
					callback()
				},
			}
		},
		dispatch(command: unknown, payload: unknown, source?: unknown): boolean[] {
			const from: unknown = source === undefined ? editor : source
			return [...registrations]
				.filter((registration) => registration.command === command)
				.map((registration) => registration.listener(payload, from))
		},
		active: () => [...registrations],
		stats,
	}
	return editor
}

type FakeEditor = ReturnType<typeof fakeEditor>

function asEditor(editor: FakeEditor): LexicalEditor {
	return editor as unknown as LexicalEditor
}

const selectionA = { id: 'a' } as unknown as BaseSelection

beforeEach(() => {
	world.selection = selectionA
})

test('subscribeToolbar: одна подписка на смену выделения и одно начальное чтение', () => {
	const editor = fakeEditor('main')
	const seen: unknown[] = []
	const unsubscribe = subscribeToolbar(editor as unknown as ToolbarEditorLike, () => (selection) => {
		seen.push(selection)
	})
	assert.equal(editor.stats.registers, 1)
	assert.equal(editor.stats.reads, 1)
	const [registration] = editor.active()
	assert.equal(registration.command, SELECTION_CHANGE_COMMAND)
	assert.equal(registration.priority, COMMAND_PRIORITY_CRITICAL)
	assert.deepEqual(seen, [selectionA])
	assert.deepEqual(editor.dispatch(SELECTION_CHANGE_COMMAND, undefined), [false])
	assert.deepEqual(seen, [selectionA, selectionA])
	unsubscribe()
	assert.equal(editor.active().length, 0)
	assert.equal(editor.stats.unregisters, 1)
})

test('subscribeToolbar: обработчик берётся при каждом событии, смена обработчика не переподписывает', () => {
	const editor = fakeEditor('main')
	const calls: string[] = []
	let current = (_selection: BaseSelection) => {
		calls.push('first')
	}
	subscribeToolbar(editor as unknown as ToolbarEditorLike, () => current)
	current = () => {
		calls.push('second')
	}
	editor.dispatch(SELECTION_CHANGE_COMMAND, undefined)
	assert.deepEqual(calls, ['first', 'second'])
	assert.equal(editor.stats.registers, 1)
})

test('subscribeToolbar: без выделения обработчик не вызывается', () => {
	world.selection = null
	const editor = fakeEditor('main')
	let calls = 0
	subscribeToolbar(editor as unknown as ToolbarEditorLike, () => () => {
		calls++
	})
	editor.dispatch(SELECTION_CHANGE_COMMAND, undefined)
	assert.equal(calls, 0)
})

test('useUpdateToolbarHandler: три рендера с новым колбэком — одна подписка, вызывается последний колбэк', () => {
	const editor = fakeEditor('main')
	world.activeEditor = asEditor(editor)
	const harness = createHarness()
	const calls: string[] = []
	for (const name of ['r1', 'r2', 'r3']) {
		harness.render(() =>
			useUpdateToolbarHandler(() => {
				calls.push(name)
			})
		)
	}
	assert.equal(editor.stats.registers, 1)
	assert.equal(editor.stats.reads, 1)
	assert.deepEqual(calls, ['r1'])
	editor.dispatch(SELECTION_CHANGE_COMMAND, undefined)
	assert.deepEqual(calls, ['r1', 'r3'])
})

test('useUpdateToolbarHandler: смена activeEditor — отписка от старого и подписка на новый', () => {
	const first = fakeEditor('first')
	const second = fakeEditor('second')
	const harness = createHarness()
	const callback = () => {}
	world.activeEditor = asEditor(first)
	harness.render(() => useUpdateToolbarHandler(callback))
	world.activeEditor = asEditor(second)
	harness.render(() => useUpdateToolbarHandler(callback))
	assert.equal(first.active().length, 0)
	assert.equal(first.stats.unregisters, 1)
	assert.equal(second.active().length, 1)
	assert.equal(second.stats.registers, 1)
	harness.unmount()
	assert.equal(second.active().length, 0)
})

test('useUpdateToolbarHandler: StrictMode оставляет ровно одну подписку', () => {
	const editor = fakeEditor('main')
	world.activeEditor = asEditor(editor)
	const harness = createHarness()
	harness.render(() => useUpdateToolbarHandler(() => {}))
	harness.strictRemount()
	assert.equal(editor.active().length, 1)
	assert.equal(editor.stats.unregisters, 1)
})

test('ToolbarPlugin: $updateToolbar стабилен, подписка на активный редактор одна на редактор', () => {
	const composer = fakeEditor('composer')
	const nested = fakeEditor('nested')
	world.composerEditor = asEditor(composer)
	const harness = createHarness()
	const render = () =>
		harness.render(() => ToolbarPlugin({ children: () => null }) as ReactElement<Record<string, unknown>>)
	const first = render()
	const second = render()
	assert.equal(first.type, ToolbarContext)
	assert.equal(second.props.$updateToolbar, first.props.$updateToolbar)
	assert.equal(second.props.activeEditor, composer)
	assert.equal(second.props.setBlockType, first.props.setBlockType)
	assert.equal(second.props.showModal, first.props.showModal)
	assert.equal(composer.stats.registers, 1)
	composer.dispatch(SELECTION_CHANGE_COMMAND, undefined, nested)
	const third = render()
	assert.equal(third.props.activeEditor, nested)
	assert.equal(third.props.$updateToolbar, first.props.$updateToolbar)
	assert.equal(composer.active().length, 0)
	assert.equal(nested.active().length, 1)
	render()
	assert.equal(nested.stats.registers, 1)
	harness.unmount()
	assert.equal(nested.active().length, 0)
})

test('ToolbarContext: при тех же редакторах и обработчиках значение контекста — тот же объект', () => {
	const editor = asEditor(fakeEditor('main'))
	const harness = createHarness()
	const props = {
		activeEditor: editor,
		$updateToolbar: () => {},
		blockType: 'paragraph',
		setBlockType: () => {},
		showModal: () => {},
		children: null,
	}
	const valueOf = (blockType: string) =>
		(harness.render(() => ToolbarContext({ ...props, blockType })) as ReactElement<{ value: unknown }>).props.value
	const first = valueOf('paragraph')
	assert.equal(valueOf('paragraph'), first)
	assert.notEqual(valueOf('h1'), first)
})
