import { describe, expect, it } from 'vitest'

import { HOME_PATH, backAction, isPagePath, parentPagePath } from './paths'

describe('isPagePath', () => {
	it('промежуточные сегменты без страницы не считаются страницами', () => {
		expect(isPagePath('/tests/cell')).toBe(false)
		expect(isPagePath('/tests/cell/')).toBe(false)
		expect(isPagePath('/invite')).toBe(false)
		expect(isPagePath('/notifications')).toBe(false)
		expect(isPagePath('/admin/tests/cell/basics/questions')).toBe(false)
		expect(isPagePath('/admin/tests/cell/basics/questions/drafts')).toBe(false)
	})

	it('настоящие страницы остаются страницами', () => {
		expect(isPagePath('/tests')).toBe(true)
		expect(isPagePath('/tests/cell/basics')).toBe(true)
		expect(isPagePath('/admin/tests/cell')).toBe(true)
		expect(isPagePath('/invite/token-1')).toBe(true)
	})
})

describe('parentPagePath', () => {
	it('пропускает сегменты без страницы', () => {
		expect(parentPagePath('/tests/cell/basics')).toBe('/tests')
		expect(parentPagePath('/tests/cell/basics/start')).toBe('/tests/cell/basics')
		expect(parentPagePath('/admin/tests/cell/basics/questions/42')).toBe('/admin/tests/cell/basics')
		expect(parentPagePath('/admin/tests/cell/basics/questions/drafts/7')).toBe('/admin/tests/cell/basics')
	})

	it('страница перехода уведомления ведёт на главную', () => {
		expect(parentPagePath('/notifications/9f1c')).toBe(HOME_PATH)
	})

	it('чужой профиль ведёт к списку пользователей', () => {
		expect(parentPagePath('/profile/ivan.petrov')).toBe('/admin/users')
	})

	it('верхний уровень и корень ведут на главную', () => {
		expect(parentPagePath('/admin')).toBe(HOME_PATH)
		expect(parentPagePath('/dashboard')).toBe(HOME_PATH)
		expect(parentPagePath('/')).toBe(HOME_PATH)
	})

	it('игнорирует query, hash и завершающий слэш', () => {
		expect(parentPagePath('/admin/attempts/9?from=dashboard')).toBe('/admin/attempts')
		expect(parentPagePath('/admin/users/5/#top')).toBe('/admin/users')
	})
})

describe('backAction', () => {
	it('с историей — назад по истории', () => {
		expect(backAction('/admin/attempts/9', true)).toEqual({ kind: 'history' })
	})

	it('без истории — переход на родительскую страницу', () => {
		expect(backAction('/admin/attempts/9', false)).toEqual({ kind: 'push', href: '/admin/attempts' })
		expect(backAction('/tests/cell/basics', false)).toEqual({ kind: 'push', href: '/tests' })
	})
})
