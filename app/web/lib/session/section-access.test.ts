import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, test, vi } from 'vitest'

import { sectionForPath, type Section } from './route-permissions'

const holders = vi.hoisted(() => ({ me: null as Record<string, unknown> | null }))

vi.mock('server-only', () => ({}))
vi.mock('./server', () => ({ getServerMe: async () => holders.me }))

const { sectionAccess } = await import('./section-access')

function meWith(roles: string[], perms: string[]) {
	return { id: 'u1', login: 'u1', roles, perms }
}

beforeEach(() => {
	holders.me = null
})

describe('sectionAccess', () => {
	test('без сессии — anonymous', async () => {
		assert.deepEqual(await sectionAccess('admin'), { kind: 'anonymous' })
	})

	test('роль admin без нужного права не проходит, обхода по роли нет', async () => {
		holders.me = meWith(['admin'], ['tests.read'])
		assert.equal((await sectionAccess('rbac')).kind, 'denied')
		assert.equal((await sectionAccess('settings')).kind, 'denied')
	})

	test('роль user с одним tests.read проходит в tests и attempts, но не в users и groups', async () => {
		holders.me = meWith(['user'], ['tests.read'])
		assert.deepEqual(await sectionAccess('tests'), { kind: 'allowed', me: holders.me })
		assert.equal((await sectionAccess('attempts')).kind, 'allowed')
		assert.equal((await sectionAccess('admin')).kind, 'allowed')
		assert.equal((await sectionAccess('users')).kind, 'denied')
		assert.equal((await sectionAccess('groups')).kind, 'denied')
	})
})

const ADMIN_ROOT = fileURLToPath(new URL('../../app/(internal)/(protected)/admin', import.meta.url))

function layoutsUnder(dir: string): string[] {
	const found: string[] = []
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name)
		if (statSync(full).isDirectory()) found.push(...layoutsUnder(full))
		else if (name === 'layout.tsx') found.push(full)
	}
	return found
}

describe('admin layouts запрашивают раздел своего пути', () => {
	test('каждый layout с SectionGate передаёт раздел, который даёт sectionForPath', () => {
		const checked: string[] = []
		for (const file of layoutsUnder(ADMIN_ROOT)) {
			const source = readFileSync(file, 'utf8')
			const match = source.match(/SectionGate section="([a-z]+)"/)
			if (!match) continue
			const route = `/admin${path
				.dirname(path.relative(ADMIN_ROOT, file))
				.split(path.sep)
				.filter((part) => part !== '.' && !part.startsWith('('))
				.map((part) => `/${part}`)
				.join('')}`
			assert.equal(match[1] as Section, sectionForPath(route), route)
			checked.push(route)
		}
		assert.ok(checked.length >= 8, `проверено layout: ${checked.join(' ')}`)
	})
})
