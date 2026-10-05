import { z, type ZodError } from 'zod'

export const LINK_URL_MESSAGE = 'Адрес ссылки: путь от корня сайта, например /tests, или полный адрес http(s)://…'

const MAX_URL_LENGTH = 2048

function hasSpaceControlOrBackslash(value: string): boolean {
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0
		if (code <= 0x20 || code === 0x7f || char === '\\' || /\s/.test(char)) return true
	}
	return false
}

export function isAllowedLinkUrl(value: string): boolean {
	if (value.length === 0 || value.length > MAX_URL_LENGTH || hasSpaceControlOrBackslash(value)) return false
	if (value.startsWith('/')) return !value.startsWith('//')
	try {
		const url = new URL(value)
		return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
	} catch {
		return false
	}
}

const title = z
	.string({ required_error: 'Укажите название ссылки', invalid_type_error: 'Название ссылки должно быть строкой' })
	.trim()
	.min(1, 'Укажите название ссылки')
	.max(80, 'Название ссылки длиннее 80 символов')

const url = z
	.string({ required_error: LINK_URL_MESSAGE, invalid_type_error: LINK_URL_MESSAGE })
	.trim()
	.refine(isAllowedLinkUrl, LINK_URL_MESSAGE)

const icon = z
	.string({ required_error: 'Выберите иконку', invalid_type_error: 'Иконка должна быть строкой' })
	.trim()
	.regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/, 'Неизвестное имя иконки')

const target = z.enum(['_self', '_blank'], {
	errorMap: () => ({ message: 'Ссылка открывается в этой или в новой вкладке' }),
})

const order = z
	.number({ invalid_type_error: 'Порядок должен быть числом' })
	.int('Порядок должен быть целым числом')
	.min(0, 'Порядок не может быть отрицательным')
	.max(10_000, 'Порядок больше 10000')

export const SidebarItemCreateSchema = z.object({
	title,
	url,
	icon,
	target: target.default('_self'),
	order: order.default(0),
})

export const SidebarItemUpdateSchema = z
	.object({
		title: title.optional(),
		url: url.optional(),
		icon: icon.optional(),
		target: target.optional(),
		order: order.optional(),
		isActive: z.boolean({ invalid_type_error: 'Видимость должна быть да или нет' }).optional(),
	})
	.refine((body) => Object.values(body).some((value) => value !== undefined), 'Нет полей для изменения')

export const SidebarReorderSchema = z.object({
	items: z
		.array(
			z.object({
				id: z.string().uuid('Неверный идентификатор пункта'),
				order,
			}),
			{ required_error: 'Передайте список пунктов', invalid_type_error: 'Передайте список пунктов' }
		)
		.max(500, 'Слишком много пунктов'),
})

export function badRequestBody(error: ZodError): { error: string; details: ReturnType<ZodError['flatten']> } {
	return { error: error.issues[0]?.message ?? 'Некорректные данные', details: error.flatten() }
}
