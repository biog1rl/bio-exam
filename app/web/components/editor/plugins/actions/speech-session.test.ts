import type { ReactElement, ReactNode } from 'react'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import { createHarness } from '@/test-support/fake-react'

import { createSpeechSession, type SpeechRecognitionLike } from './speech-session'
import { SPEECH_TO_TEXT_COMMAND, SpeechToTextPlugin } from './speech-to-text-plugin'

const world = vi.hoisted(() => ({
	editor: null as unknown,
	reports: [] as string[],
	report: null as unknown,
}))

vi.mock('react', async (importOriginal) =>
	(await import('@/test-support/fake-react')).mockReact(await importOriginal<Record<string, unknown>>())
)

vi.mock('@lexical/react/LexicalComposerContext', () => ({
	useLexicalComposerContext: () => [world.editor],
}))

vi.mock('@/components/editor/editor-hooks/use-report', () => ({
	useReport: () => world.report,
}))

type Listener = (event: unknown) => void

class FakeRecognition implements SpeechRecognitionLike {
	static instances: FakeRecognition[] = []
	continuous = false
	interimResults = false
	listeners = new Map<string, Set<Listener>>()
	added: Array<[string, Listener]> = []
	calls = { start: 0, stop: 0, abort: 0 }

	constructor() {
		FakeRecognition.instances.push(this)
	}

	start() {
		this.calls.start++
	}

	stop() {
		this.calls.stop++
	}

	abort() {
		this.calls.abort++
	}

	addEventListener(type: string, fn: Listener) {
		const set = this.listeners.get(type) ?? new Set()
		set.add(fn)
		this.listeners.set(type, set)
		this.added.push([type, fn])
	}

	removeEventListener(type: string, fn: Listener) {
		this.listeners.get(type)?.delete(fn)
	}

	listenerCount(): number {
		let count = 0
		for (const set of this.listeners.values()) count += set.size
		return count
	}

	types(): string[] {
		return [...this.listeners.entries()]
			.filter(([, set]) => set.size > 0)
			.map(([type]) => type)
			.sort()
	}

	emit(type: string, event: unknown = {}) {
		for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event)
	}

	emitToAll(type: string, event: unknown = {}) {
		for (const [added, fn] of this.added) if (added === type) fn(event)
	}
}

function resultEvent(transcript: string, isFinal: boolean) {
	const alternative = { transcript }
	const result = { isFinal, item: (index: number) => (index === 0 ? alternative : undefined) }
	return { resultIndex: 0, results: { item: (index: number) => (index === 0 ? result : undefined) } }
}

function session() {
	const texts: Array<[string, boolean]> = []
	let stops = 0
	const created: FakeRecognition[] = []
	const value = createSpeechSession({
		create: () => {
			const recognition = new FakeRecognition()
			created.push(recognition)
			return recognition
		},
		onText: (text, isFinal) => texts.push([text, isFinal]),
		onStop: () => {
			stops++
		},
	})
	return { value, texts, created, stops: () => stops }
}

beforeEach(() => {
	FakeRecognition.instances = []
	world.reports = []
	world.report = (text: string) => {
		world.reports.push(text)
	}
})

afterEach(() => {
	vi.unstubAllGlobals()
})

test('start создаёт распознавание, ставит слушатели result, end, error и запускает его', () => {
	const { value, created } = session()
	assert.equal(created.length, 0)
	value.start()
	assert.equal(created.length, 1)
	assert.deepEqual(created[0].types(), ['end', 'error', 'result'])
	assert.equal(created[0].calls.start, 1)
	value.start()
	assert.equal(created.length, 1)
	assert.equal(created[0].calls.start, 1)
})

test('result передаёт текст и признак окончательного результата', () => {
	const { value, created, texts } = session()
	value.start()
	created[0].emit('result', resultEvent('привет', false))
	created[0].emit('result', resultEvent('привет мир', true))
	assert.deepEqual(texts, [
		['привет', false],
		['привет мир', true],
	])
})

test('stop вызывает stop распознавания', () => {
	const { value, created } = session()
	value.stop()
	value.start()
	value.stop()
	assert.equal(created[0].calls.stop, 1)
	assert.equal(created[0].calls.abort, 0)
})

test('dispose вызывает abort, снимает все слушатели, повторный dispose безопасен', () => {
	const { value, created } = session()
	value.start()
	value.dispose()
	assert.equal(created[0].calls.abort, 1)
	assert.equal(created[0].listenerCount(), 0)
	value.dispose()
	assert.equal(created[0].calls.abort, 1)
	value.start()
	assert.equal(created.length, 1)
	assert.equal(created[0].calls.start, 1)
})

test('событие result после dispose не вызывает onText', () => {
	const { value, created, texts, stops } = session()
	value.start()
	value.dispose()
	created[0].emitToAll('result', resultEvent('поздно', true))
	created[0].emitToAll('end')
	assert.deepEqual(texts, [])
	assert.equal(stops(), 0)
})

test('end или error завершают сессию: onStop один раз, слушатели сняты', () => {
	const { value, created, stops } = session()
	value.start()
	created[0].emit('error', { error: 'network' })
	created[0].emit('end')
	assert.equal(stops(), 1)
	assert.equal(created[0].listenerCount(), 0)
	value.dispose()
	assert.equal(created[0].calls.abort, 0)
})

type Tree = ReactElement<{ children?: ReactNode; onClick?: () => void; 'aria-label'?: string }>

function findProps(node: ReactNode, key: 'onClick' | 'aria-label'): Tree['props'] | null {
	if (node === null || typeof node !== 'object') return null
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findProps(child, key)
			if (found) return found
		}
		return null
	}
	const element = node as Tree
	if (!element.props) return null
	if (element.props[key] !== undefined) return element.props
	return findProps(element.props.children, key)
}

type Registration = { command: unknown; listener: (payload: unknown) => boolean }

function fakeEditor() {
	const registrations = new Set<Registration>()
	const stats = { updates: 0 }
	return {
		registerCommand(command: unknown, listener: Registration['listener']) {
			const registration = { command, listener }
			registrations.add(registration)
			return () => {
				registrations.delete(registration)
			}
		},
		dispatchCommand(command: unknown, payload: unknown) {
			for (const registration of [...registrations])
				if (registration.command === command) registration.listener(payload)
			return true
		},
		update() {
			stats.updates++
		},
		commandCount: () =>
			[...registrations].filter((registration) => registration.command === SPEECH_TO_TEXT_COMMAND).length,
		stats,
	}
}

function mountPlugin() {
	const editor = fakeEditor()
	world.editor = editor
	const outer = createHarness()
	const element = outer.render(() => SpeechToTextPlugin()) as ReactElement<Record<string, never>> | null
	assert.ok(element)
	const inner = createHarness()
	const component = element.type as (props: Record<string, never>) => ReactNode
	const render = () => inner.render(() => component(element.props))
	let tree = render()
	return {
		editor,
		inner,
		click() {
			findProps(tree, 'onClick')?.onClick?.()
			tree = render()
		},
		rerender() {
			tree = render()
		},
		label: () => findProps(tree, 'aria-label')?.['aria-label'],
	}
}

test('плагин без поддержки распознавания в среде ничего не рисует', () => {
	world.editor = fakeEditor()
	const harness = createHarness()
	assert.equal(
		harness.render(() => SpeechToTextPlugin()),
		null
	)
	vi.stubGlobal('window', {})
	assert.equal(
		harness.render(() => SpeechToTextPlugin()),
		null
	)
})

test('плагин: включение создаёт сессию, выключение и повторное включение — новая сессия', () => {
	vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })
	const plugin = mountPlugin()
	assert.equal(plugin.editor.commandCount(), 1)
	assert.equal(FakeRecognition.instances.length, 0)
	assert.equal(plugin.label(), 'Disable speech to text')
	plugin.click()
	assert.equal(plugin.label(), 'Enable speech to text')
	const [first] = FakeRecognition.instances
	assert.equal(first.calls.start, 1)
	assert.equal(first.continuous, true)
	assert.equal(first.interimResults, true)
	assert.equal(first.listenerCount(), 3)
	first.emit('result', resultEvent('слово', false))
	first.emit('result', resultEvent('слово', true))
	assert.deepEqual(world.reports, ['слово', 'слово'])
	assert.equal(plugin.editor.stats.updates, 1)
	plugin.click()
	assert.equal(plugin.label(), 'Disable speech to text')
	assert.equal(first.calls.abort, 1)
	assert.equal(first.listenerCount(), 0)
	plugin.click()
	assert.equal(FakeRecognition.instances.length, 2)
	assert.equal(FakeRecognition.instances[1].calls.start, 1)
	assert.equal(plugin.editor.commandCount(), 1)
})

test('плагин: конец распознавания возвращает кнопку в выключенное состояние', () => {
	vi.stubGlobal('window', { SpeechRecognition: FakeRecognition })
	const plugin = mountPlugin()
	plugin.click()
	const [first] = FakeRecognition.instances
	first.emit('end')
	plugin.rerender()
	assert.equal(plugin.label(), 'Disable speech to text')
	assert.equal(first.listenerCount(), 0)
	plugin.click()
	assert.equal(FakeRecognition.instances.length, 2)
})

test('плагин: размонтирование — abort, слушатели сняты, отписка от команды, состояние больше не меняется', () => {
	vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })
	const plugin = mountPlugin()
	plugin.click()
	const [first] = FakeRecognition.instances
	plugin.inner.unmount()
	assert.equal(first.calls.abort, 1)
	assert.equal(first.listenerCount(), 0)
	assert.equal(plugin.editor.commandCount(), 0)
	const reports = world.reports.length
	first.emitToAll('result', resultEvent('после ухода', true))
	first.emitToAll('error', { error: 'aborted' })
	first.emitToAll('end')
	plugin.editor.dispatchCommand(SPEECH_TO_TEXT_COMMAND, true)
	assert.equal(world.reports.length, reports)
	assert.equal(plugin.editor.stats.updates, 0)
	assert.equal(plugin.inner.stateUpdatesAfterUnmount(), 0)
})
