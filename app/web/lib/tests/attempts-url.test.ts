import { describe, expect, it } from 'vitest'

import { attemptsUrl, parseAttemptsUrl } from './attempts-url'

describe('parseAttemptsUrl', () => {
	it('читает тему, ученика и статус из URLSearchParams', () => {
		expect(
			parseAttemptsUrl(new URLSearchParams('topic=cell&student=00000000-0000-4000-8000-000000000042&status=all'))
		).toEqual({
			topic: 'cell',
			student: '00000000-0000-4000-8000-000000000042',
			status: 'all',
		})
	})

	it('читает searchParams страницы, берёт первое значение массива', () => {
		expect(parseAttemptsUrl({ topic: ['cell', 'x'], student: undefined })).toEqual({
			topic: 'cell',
			student: null,
			status: 'active',
		})
	})

	it('ученик не в формате UUID отбрасывается: сервер его отклонит', () => {
		expect(parseAttemptsUrl(new URLSearchParams('student=42')).student).toBeNull()
	})

	it('пустые, слишком длинные и неизвестные значения отбрасываются', () => {
		expect(parseAttemptsUrl(new URLSearchParams(`topic=%20&student=${'a'.repeat(201)}&status=deleted`))).toEqual({
			topic: null,
			student: null,
			status: 'active',
		})
	})
})

describe('attemptsUrl', () => {
	it('собирает ссылку только из заданных фильтров', () => {
		expect(attemptsUrl({})).toBe('/admin/attempts')
		expect(attemptsUrl({ student: '00000000-0000-4000-8000-000000000042' })).toBe(
			'/admin/attempts?student=00000000-0000-4000-8000-000000000042'
		)
		expect(attemptsUrl({ topic: 'cell', status: 'active' })).toBe('/admin/attempts?topic=cell')
		expect(attemptsUrl({ student: '00000000-0000-4000-8000-000000000042', status: 'all' })).toBe(
			'/admin/attempts?student=00000000-0000-4000-8000-000000000042&status=all'
		)
	})

	it('разбор обратен сборке', () => {
		const filters = { topic: 'клетка', student: '00000000-0000-4000-8000-000000000042', status: 'inactive' as const }
		const url = attemptsUrl(filters)
		expect(parseAttemptsUrl(new URL(url, 'http://x').searchParams)).toEqual(filters)
	})
})
