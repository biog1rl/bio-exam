import { expect, it } from 'vitest'

import { newTestHref } from './new-test-href'

it('новый тест из темы передаёт тему в адресе', () => {
	expect(newTestHref()).toBe('/admin/tests/new')
	expect(newTestHref(null)).toBe('/admin/tests/new')
	expect(newTestHref('клетка')).toBe('/admin/tests/new?topic=%D0%BA%D0%BB%D0%B5%D1%82%D0%BA%D0%B0')
})
