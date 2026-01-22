import { transliterate } from '../../lib/transliterate.js'
import type { DocRecord } from '../../types/services/search.service.js'
import { extractHeadings, stripMarkdownToText } from './markdown.js'
import { asciiFold } from './tokenize.js'

// import { getFile } from '../docs/files.js'
const getFile = (_rel: string) => null as any

/** Имена «индексных» файлов, которые считаются родительской страницей. */
const INDEX_SEGMENTS = new Set(['index', 'page', 'readme', 'README'])

/**
 * Убирает завершающий "/index" из относительного пути.
 * @param {string} rel POSIX-путь без расширения.
 * @returns {string} Путь без "/index" на конце.
 */
const stripTrailingIndex = (rel: string) => rel.replace(/\/index$/, '')

/**
 * Определяет «собственное имя» страницы по пути.
 * Если файл — index/page/readme внутри папки, возвращает имя родительской папки.
 * @param {string} rel POSIX-путь без расширения.
 * @returns {string} Имя страницы.
 */
function ownNameFromRel(rel: string): string {
	const parts = rel.split('/').filter(Boolean)
	if (!parts.length) return ''
	const last = parts[parts.length - 1]
	if (INDEX_SEGMENTS.has(last) && parts.length > 1) return parts[parts.length - 2]
	return last
}

/**
 * Читает markdown+frontmatter по относительному пути и строит DocRecord для индекса.
 * @param {string} rel POSIX-путь без расширения относительно DOCS_ROOT.
 * @returns {DocRecord | null} Объект DocRecord или null, если файл не найден.
 */
export function createDocRecord(rel: string): DocRecord | null {
	const file = getFile(rel)
	if (!file) return null

	// Определяем заголовок: сначала из фронтматтера, потом # H1, иначе имя файла.
	const fmTitle = typeof file.frontmatter?.title === 'string' ? file.frontmatter.title : ''
	const h1 = file.body.match(/^#\s+(.+)$/m)?.[1]?.trim()
	const title = fmTitle || h1 || rel.split('/').pop() || 'Untitled'

	// Плоский текст и его ASCII-вариант.
	const text = stripMarkdownToText(file.body)
	const textFold = asciiFold(text).toLowerCase()

	// Извлекаем заголовки ## и глубже.
	const headings = extractHeadings(file.body)

	// Определяем имя и его варианты.
	const name = ownNameFromRel(rel)
	const nameFold = asciiFold(name).toLowerCase()
	const nameAlt = transliterate(name).toLowerCase()

	// Формируем человекочитаемую ссылку без "/index".
	const href = `/docs/${transliterate(stripTrailingIndex(rel))}`

	// Собираем поле с ключевыми словами для поиска.
	const tokens = [title, rel, href, ...headings, transliterate(title), transliterate(rel), asciiFold(title)]
		.filter(Boolean)
		.join(' ')

	return {
		id: rel,
		rel,
		title,
		headings,
		text,
		textFold,
		href,
		tokens,
		name,
		nameFold,
		nameAlt,
	}
}
