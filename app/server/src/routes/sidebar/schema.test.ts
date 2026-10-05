import { describe, expect, test } from 'vitest'

import {
	LINK_URL_MESSAGE,
	SidebarItemCreateSchema,
	SidebarItemUpdateSchema,
	SidebarReorderSchema,
	badRequestBody,
	isAllowedLinkUrl,
} from './schema.js'

describe('isAllowedLinkUrl', () => {
	test.each(['/tests', '/admin/tests?topic=cell', '/', 'https://example.test/rules', 'http://example.test'])(
		'%s — допустим',
		(url) => {
			expect(isAllowedLinkUrl(url)).toBe(true)
		}
	)

	test.each([
		'',
		'//evil.example/x',
		'javascript:alert(1)',
		'JAVASCRIPT:alert(1)',
		'data:text/html,<b>x</b>',
		'mailto:a@example.test',
		'ftp://example.test/file',
		'tests',
		'/tests with space',
		'/\\evil.example',
		'https://',
		`/${'a'.repeat(2048)}`,
	])('%s — отклонён', (url) => {
		expect(isAllowedLinkUrl(url)).toBe(false)
	})
})

describe('схемы пунктов меню', () => {
	test('создание: значения по умолчанию и обрезка пробелов', () => {
		const parsed = SidebarItemCreateSchema.parse({ title: '  Правила ', url: ' /rules ', icon: 'BookOpen' })
		expect(parsed).toEqual({ title: 'Правила', url: '/rules', icon: 'BookOpen', target: '_self', order: 0 })
	})

	test('создание: опасный адрес даёт русское сообщение первым', () => {
		const result = SidebarItemCreateSchema.safeParse({ title: 'x', url: 'javascript:alert(1)', icon: 'Cat' })
		expect(result.success).toBe(false)
		if (result.success) return
		const body = badRequestBody(result.error)
		expect(body.error).toBe(LINK_URL_MESSAGE)
		expect(body.details.fieldErrors.url).toEqual([LINK_URL_MESSAGE])
	})

	test('создание: пустое название, неизвестная цель и дробный порядок отклоняются', () => {
		const result = SidebarItemCreateSchema.safeParse({
			title: '   ',
			url: '/x',
			icon: 'Cat',
			target: '_parent',
			order: 1.5,
		})
		expect(result.success).toBe(false)
		if (result.success) return
		expect(Object.keys(result.error.flatten().fieldErrors).sort()).toEqual(['order', 'target', 'title'])
	})

	test('создание: имя иконки без пробелов и знаков', () => {
		expect(SidebarItemCreateSchema.safeParse({ title: 'x', url: '/x', icon: 'Bad Icon' }).success).toBe(false)
		expect(SidebarItemCreateSchema.safeParse({ title: 'x', url: '/x', icon: '<svg>' }).success).toBe(false)
	})

	test('изменение: можно передать одно поле, пустое тело отклоняется', () => {
		expect(SidebarItemUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false })
		expect(SidebarItemUpdateSchema.safeParse({}).success).toBe(false)
		expect(SidebarItemUpdateSchema.safeParse({ url: '//evil.example' }).success).toBe(false)
	})

	test('порядок: идентификаторы — UUID, порядок — целые числа', () => {
		const id = '00000000-0000-4000-8000-000000000001'
		expect(SidebarReorderSchema.safeParse({ items: [{ id, order: 0 }] }).success).toBe(true)
		expect(SidebarReorderSchema.safeParse({ items: [{ id: 'x', order: 0 }] }).success).toBe(false)
		expect(SidebarReorderSchema.safeParse({ items: 'x' }).success).toBe(false)
	})
})
