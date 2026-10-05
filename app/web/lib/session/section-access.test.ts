import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, test, vi } from 'vitest'

import { sectionForPath, type Section } from './route-permissions'

const holders = vi.hoisted(() => ({ me: null as Record<string, unknown> | null, notFoundCalls: 0 }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
	notFound: () => {
		holders.notFoundCalls += 1
		throw new Error('not-found')
	},
}))
vi.mock('./server', () => ({ getServerMe: async () => holders.me }))

const { requireSectionAccess } = await import('./section-access')

function meWith(roles: string[], perms: string[]) {
	return { id: 'u1', login: 'u1', roles, perms }
}

beforeEach(() => {
	holders.me = null
	holders.notFoundCalls = 0
})

describe('requireSectionAccess', () => {
	test('без сессии возвращает null и не вызывает notFound', async () => {
		assert.equal(await requireSectionAccess('admin'), null)
		assert.equal(holders.notFoundCalls, 0)
	})

	test('роль admin без нужного права не проходит: notFound, обхода по роли нет', async () => {
		holders.me = meWith(['admin'], ['tests.read'])
		await assert.rejects(requireSectionAccess('rbac'), /not-found/)
		await assert.rejects(requireSectionAccess('settings'), /not-found/)
		assert.equal(holders.notFoundCalls, 2)
	})

	test('роль user с одним tests.read проходит в tests и attempts, но не в users и groups', async () => {
		holders.me = meWith(['user'], ['tests.read'])
		assert.equal(await requireSectionAccess('tests'), holders.me)
		assert.equal(await requireSectionAccess('attempts'), holders.me)
		assert.equal(await requireSectionAccess('admin'), holders.me)
		await assert.rejects(requireSectionAccess('users'), /not-found/)
		await assert.rejects(requireSectionAccess('groups'), /not-found/)
	})

	test('без единого права раздел admin закрыт', async () => {
		holders.me = meWith(['user'], [])
		await assert.rejects(requireSectionAccess('admin'), /not-found/)
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
	test('каждый layout с requireSectionAccess передаёт раздел, который даёт sectionForPath', () => {
		const checked: string[] = []
		for (const file of layoutsUnder(ADMIN_ROOT)) {
			const source = readFileSync(file, 'utf8')
			const match = source.match(/requireSectionAccess\('([a-z]+)'\)/)
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
