import { describe, expect, it } from 'vitest'

import { crumbTrail, fallbackCrumbLabel, staticCrumbLabel } from './crumbs'

describe('crumbTrail', () => {
	it('главная и корень без цепочки', () => {
		expect(crumbTrail('/')).toEqual([])
		expect(crumbTrail('/dashboard')).toEqual([])
	})

	it('цепочка идёт по страницам и пропускает сегменты без страницы', () => {
		expect(crumbTrail('/tests/cell/basics/start')).toEqual(['/tests', '/tests/cell/basics', '/tests/cell/basics/start'])
		expect(crumbTrail('/admin/tests/cell/basics/questions/42')).toEqual([
			'/admin',
			'/admin/tests',
			'/admin/tests/cell',
			'/admin/tests/cell/basics',
			'/admin/tests/cell/basics/questions/42',
		])
	})

	it('чужой профиль — под пользователями', () => {
		expect(crumbTrail('/profile/ivan.petrov')).toEqual(['/admin', '/admin/users', '/profile/ivan.petrov'])
		expect(crumbTrail('/profile')).toEqual(['/profile'])
	})

	it('настройки — под панелью управления', () => {
		expect(crumbTrail('/admin/settings/rbac')).toEqual(['/admin', '/admin/settings', '/admin/settings/rbac'])
	})
})

describe('подписи крошек', () => {
	it('разделы реестра подписываются названием раздела', () => {
		expect(staticCrumbLabel('/admin')).toBe('Панель управления')
		expect(staticCrumbLabel('/admin/tests')).toBe('Банк заданий')
		expect(staticCrumbLabel('/tests')).toBe('Тесты')
		expect(staticCrumbLabel('/admin/sidebar')).toBe('Ссылки в меню')
	})

	it('страницы с параметром подписываются по шаблону', () => {
		expect(staticCrumbLabel('/tests/cell/basics/start')).toBe('Прохождение')
		expect(staticCrumbLabel('/admin/attempts/9f1c')).toBe('Разбор попытки')
		expect(staticCrumbLabel('/invite/abc')).toBe('Приглашение')
		expect(staticCrumbLabel('/profile/%D0%B8%D0%B2%D0%B0%D0%BD')).toBe('иван')
		expect(staticCrumbLabel('/admin/tests/cell')).toBeNull()
	})

	it('запасная подпись — последний сегмент без дефисов', () => {
		expect(fallbackCrumbLabel('/admin/tests/cell-structure')).toBe('Cell structure')
	})
})
