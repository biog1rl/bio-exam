import { PERMISSION_DOMAINS, ROLE_REGISTRY, type PermissionDomain, type PermissionKey } from '@bio-exam/rbac'

import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { allSitePages, visibleSiteMap } from './site-map'

const APP_DIR = fileURLToPath(new URL('../app', import.meta.url))
const NOT_LISTED = new Set(['/', '/login', '/sitemap'])

function rolePerms(role: keyof typeof ROLE_REGISTRY): Set<PermissionKey> {
	const keys = new Set<PermissionKey>()
	const grants = ROLE_REGISTRY[role].grants as Partial<Record<PermissionDomain, readonly string[]>>
	for (const domain of Object.keys(grants) as PermissionDomain[]) {
		const granted = grants[domain] ?? []
		const actions: readonly string[] = granted.includes('*') ? PERMISSION_DOMAINS[domain].actions : granted
		for (const action of actions) keys.add(`${domain}.${action}` as PermissionKey)
	}
	return keys
}

function visibleHrefs(role: keyof typeof ROLE_REGISTRY): string[] {
	return visibleSiteMap(rolePerms(role)).flatMap((group) => group.pages.map((page) => page.href))
}

function staticPages(dir: string): string[] {
	const found: string[] = []
	for (const name of readdirSync(dir)) {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) found.push(...staticPages(full))
		else if (name === 'page.tsx') {
			const route = relative(APP_DIR, dir)
				.split(sep)
				.filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment))
			if (route.some((segment) => segment.startsWith('['))) continue
			found.push(`/${route.join('/')}`)
		}
	}
	return found
}

describe('visibleSiteMap', () => {
	it('администратор видит все страницы карты', () => {
		expect(visibleHrefs('admin')).toEqual(allSitePages().map((page) => page.href))
	})

	it('учитель видит свои разделы без каталога и настроек', () => {
		expect(visibleHrefs('teacher')).toEqual([
			'/dashboard',
			'/tests',
			'/profile',
			'/admin',
			'/admin/attempts',
			'/admin/users',
			'/admin/groups',
			'/admin/tests',
			'/admin/tests/new',
		])
	})

	it('ученик видит только основные страницы', () => {
		expect(visibleSiteMap(rolePerms('user')).map((group) => group.key)).toEqual(['main'])
		expect(visibleHrefs('user')).toEqual(['/dashboard', '/tests', '/profile'])
	})

	it('без права записи тестов нет страницы нового теста', () => {
		const perms = new Set<PermissionKey>(['tests.read'])
		expect(visibleSiteMap(perms).flatMap((group) => group.pages.map((page) => page.href))).not.toContain(
			'/admin/tests/new'
		)
	})
})

describe('состав карты сайта', () => {
	it('каждая страница без параметров в адресе есть в карте, и каждая ссылка карты ведёт на страницу', () => {
		const pages = staticPages(APP_DIR).filter((href) => !NOT_LISTED.has(href))
		const listed = allSitePages().map((page) => page.href)
		expect([...listed].sort()).toEqual([...pages].sort())
	})
})
