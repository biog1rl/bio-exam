import { describe, expect, it } from 'vitest'

import { createScrollMemory } from './scroll-memory'

describe('createScrollMemory', () => {
	it('переход на новую страницу начинается сверху', () => {
		const memory = createScrollMemory()
		memory.save('/admin', 540)
		expect(memory.target('/admin/groups', 'push', false)).toBe(0)
		expect(memory.target('/admin', 'push', false)).toBe(0)
	})

	it('«Назад» и «Вперёд» возвращают сохранённое положение, без него — верх', () => {
		const memory = createScrollMemory()
		memory.save('/admin', 540)
		expect(memory.target('/admin', 'pop', false)).toBe(540)
		expect(memory.target('/admin/users', 'pop', false)).toBe(0)
	})

	it('с якорем в адресе прокрутку не трогает', () => {
		const memory = createScrollMemory()
		expect(memory.target('/admin', 'push', true)).toBeNull()
		expect(memory.target('/admin', 'pop', true)).toBeNull()
	})

	it('хранит не больше заданного числа адресов, вытесняя самые старые', () => {
		const memory = createScrollMemory(2)
		memory.save('/a', 10)
		memory.save('/b', 20)
		memory.save('/a', 30)
		memory.save('/c', 40)
		expect(memory.target('/b', 'pop', false)).toBe(0)
		expect(memory.target('/a', 'pop', false)).toBe(30)
		expect(memory.target('/c', 'pop', false)).toBe(40)
	})

	it('отрицательная прокрутка сохраняется как ноль', () => {
		const memory = createScrollMemory()
		memory.save('/a', -5)
		expect(memory.target('/a', 'pop', false)).toBe(0)
	})
})
