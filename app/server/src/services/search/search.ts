import type { SearchResult } from 'minisearch'

import type { DocRecord, SearchHit } from '../../types/services/search.service.js'
import { highlightSnippet, includesAllTokens } from './highlight.js'
import { getIndex, getStore } from './state.js'
import { asciiFold, expandQueryVariants, tokenizeUnicode } from './tokenize.js'

/**
 * Выполняет поиск по индексу MiniSearch и добавляет к результатам сниппеты.
 * @param {string} query Строка запроса пользователя.
 * @param {number} [limit=20] Максимальное количество элементов в ответе.
 * @param {number} [offset=0] Смещение для пагинации.
 * @returns {SearchHit[]} Массив найденных результатов.
 * @throws {Error} Если индекс ещё не построен.
 */
export function searchInIndex(query: string, limit = 20, offset = 0): SearchHit[] {
	const index = getIndex()
	if (!index) throw new Error('Index is not built yet')

	const trimmed = (query ?? '').trim()
	if (!trimmed) return []

	const variants = expandQueryVariants(trimmed)
	if (!variants.length) return []

	const store = getStore()
	const bucket = new Map<string, { rec: DocRecord; score: number; matchedBy: Set<'name' | 'title' | 'text'> }>()

	for (const variant of variants) {
		const hits = index.search(variant, { prefix: true, fuzzy: 0.2 }) as (SearchResult & DocRecord)[]
		for (const hit of hits) {
			const record = store.get(hit.id)
			if (!record) continue

			const prev = bucket.get(record.id)
			const score = Math.max(prev?.score ?? 0, hit.score ?? 1)
			const matchedBy = prev?.matchedBy ?? new Set<'name' | 'title' | 'text'>()

			// Совпадения по имени файла/страницы
			const nameTokens = tokenizeUnicode(variant)
			const nameLower = record.name.toLowerCase()
			if (nameTokens.some((t) => nameLower.includes(t) || record.nameFold.includes(t) || record.nameAlt.includes(t))) {
				matchedBy.add('name')
			}

			// Совпадения по заголовку
			const titleLower = record.title.toLowerCase()
			const titleFold = asciiFold(titleLower)
			if (nameTokens.some((t) => titleLower.includes(t) || titleFold.includes(t))) {
				matchedBy.add('title')
			}

			// Совпадения по основному тексту
			if (includesAllTokens(record.text.toLowerCase(), record.textFold, trimmed)) {
				matchedBy.add('text')
			}

			bucket.set(record.id, { rec: record, score, matchedBy })
		}
	}

	const filtered = Array.from(bucket.values()).filter(({ matchedBy }) => matchedBy.size > 0)
	if (!filtered.length) return []

	filtered.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score
		const pri = (set: Set<'name' | 'title' | 'text'>) => (set.has('title') || set.has('name') ? 1 : 0)
		return pri(b.matchedBy) - pri(a.matchedBy)
	})

	const slice = filtered.slice(offset, offset + limit)

	return slice.map(({ rec, score, matchedBy }) => ({
		id: rec.id,
		title: rec.title,
		href: rec.href,
		rel: rec.rel,
		score,
		snippet: matchedBy.has('text') ? highlightSnippet(rec.text, trimmed) : '',
	}))
}
