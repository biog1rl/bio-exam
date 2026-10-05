import assert from 'node:assert/strict'
import { test } from 'vitest'

import type { SidebarItem } from './api'
import { SIDEBAR_RELOAD_ERROR, activeSidebarUrl, moveSidebarItem, sidebarReloadFailure } from './sidebar-items'

function item(id: string, url: string, order: number): SidebarItem {
	return { id, title: `Пункт ${id}`, url, icon: 'CircleIcon', target: '_self', order, isActive: true }
}

const DB_ITEMS: readonly SidebarItem[] = [item('a', '/dashboard', 0), item('b', '/tests', 1)]

test('sidebarReloadFailure: первая загрузка — блок, повторная — тост, auth и aborted — молча', () => {
	assert.equal(SIDEBAR_RELOAD_ERROR, 'Ошибка загрузки пунктов меню')
	assert.equal(sidebarReloadFailure({ loaded: false, kind: 'http' }), 'block')
	assert.equal(sidebarReloadFailure({ loaded: false, kind: 'network' }), 'block')
	assert.equal(sidebarReloadFailure({ loaded: true, kind: 'http' }), 'toast')
	assert.equal(sidebarReloadFailure({ loaded: true, kind: 'network' }), 'toast')
	assert.equal(sidebarReloadFailure({ loaded: true, kind: 'malformed' }), 'toast')
	assert.equal(sidebarReloadFailure({ loaded: true, kind: 'auth' }), 'silent')
	assert.equal(sidebarReloadFailure({ loaded: false, kind: 'aborted' }), 'silent')
})

test('moveSidebarItem: новый порядок с пересчётом order, исходный массив для отката не меняется', () => {
	const items = [item('a', '/a', 0), item('b', '/b', 1), item('c', '/c', 2)]
	const snapshot = structuredClone(items)
	const moved = moveSidebarItem(items, 'c', 'a')
	assert.ok(moved)
	assert.deepEqual(
		moved.map((entry) => [entry.id, entry.order]),
		[
			['c', 0],
			['a', 1],
			['b', 2],
		]
	)
	assert.deepEqual(items, snapshot)
})

test('moveSidebarItem: перенос на себя или неизвестный id — без изменений', () => {
	const items = [item('a', '/a', 0), item('b', '/b', 1)]
	assert.equal(moveSidebarItem(items, 'a', 'a'), null)
	assert.equal(moveSidebarItem(items, 'x', 'a'), null)
	assert.equal(moveSidebarItem(items, 'a', 'x'), null)
})

test('activeSidebarUrl: флаг isActive из базы не делает пункт активным, активен только пункт текущего адреса', () => {
	const urls = [...DB_ITEMS.map((entry) => entry.url), '/admin']
	assert.ok(DB_ITEMS.every((entry) => entry.isActive))
	assert.equal(activeSidebarUrl(urls, '/dashboard'), '/dashboard')
	assert.equal(activeSidebarUrl(urls, '/tests'), '/tests')
	assert.equal(activeSidebarUrl(urls, '/tests/cell/basics'), '/tests')
	assert.equal(activeSidebarUrl(urls, '/profile'), null)
	assert.equal(activeSidebarUrl(urls, '/testsuite'), null)
})

test('activeSidebarUrl: /admin активен на /admin и вложенных', () => {
	const urls = [...DB_ITEMS.map((entry) => entry.url), '/admin']
	assert.equal(activeSidebarUrl(urls, '/admin'), '/admin')
	assert.equal(activeSidebarUrl(urls, '/admin/attempts'), '/admin')
	assert.equal(activeSidebarUrl(urls, '/admin/attempts/1'), '/admin')
	assert.equal(activeSidebarUrl(urls, '/administrator'), null)
})

test('activeSidebarUrl: при вложенных пунктах активен самый точный, корень — только на /', () => {
	const urls = ['/', '/admin', '/admin/users', 'https://example.test/docs']
	assert.equal(activeSidebarUrl(urls, '/admin/users/42'), '/admin/users')
	assert.equal(activeSidebarUrl(urls, '/admin/groups'), '/admin')
	assert.equal(activeSidebarUrl(urls, '/'), '/')
	assert.equal(activeSidebarUrl(urls, '/dashboard'), null)
	assert.equal(activeSidebarUrl(['/admin/'], '/admin/users'), '/admin/')
})
