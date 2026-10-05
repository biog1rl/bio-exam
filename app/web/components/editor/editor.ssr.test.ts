import { LexicalComposer } from '@lexical/react/LexicalComposer'

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { AuthProvider } from '@/components/providers/AuthProvider'
import { parseAuthMe } from '@/lib/auth/authMePayload'

import { Editor } from './editor'
import { CounterCharacterPlugin } from './plugins/actions/counter-character-plugin'
import { CodeActionMenuPlugin } from './plugins/code-action-menu-plugin'

const teacher = parseAuthMe({
	ok: true,
	user: { id: 'teacher-id', login: 'teacher', roles: ['teacher'], perms: ['tests.read', 'tests.write'] },
	accessExpiresAt: '2030-01-01T00:00:00.000Z',
})
assert.ok(teacher)

function renderEditor(): string {
	return renderToString(
		createElement(AuthProvider, {
			initialMe: teacher,
			children: createElement(Editor, {
				preset: 'full',
				initialMdxContent: '# Заголовок',
				placeholder: 'Введите текст вопроса...',
			}),
		})
	)
}

test('среда без DOM', () => {
	assert.equal(typeof document, 'undefined')
	assert.equal(typeof window, 'undefined')
})

test('редактор с пресетом full рендерится на сервере без document и window', () => {
	const html = renderEditor()
	assert.equal(typeof html, 'string')
	assert.notEqual(html, '')
	assert.match(html, /Медиатека/)
})

test('меню блока кода без контейнера ничего не рендерит', () => {
	const props = {} as Parameters<typeof CodeActionMenuPlugin>[0]
	assert.equal(renderToString(createElement(CodeActionMenuPlugin, props)), '')
	assert.equal(renderToString(createElement(CodeActionMenuPlugin, { anchorElem: null })), '')
})

function renderCounter(charset: 'UTF-8' | 'UTF-16'): string {
	return renderToString(
		createElement(
			LexicalComposer,
			{
				initialConfig: {
					namespace: 'counter-ssr',
					onError: (error: Error) => {
						throw error
					},
				},
			},
			createElement(CounterCharacterPlugin, { charset })
		)
	)
}

test('счётчик символов рендерится на сервере в обеих кодировках', () => {
	assert.match(renderCounter('UTF-8'), /0<!-- --> characters/)
	assert.match(renderCounter('UTF-16'), /0<!-- --> characters/)
})
