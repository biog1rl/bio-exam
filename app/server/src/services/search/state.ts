import type MiniSearch from 'minisearch'

import type { DocRecord } from '../../types/services/search.service.js'

/** Текущий экземпляр MiniSearch (null — если индекс ещё не создан). */
let indexRef: MiniSearch<DocRecord> | null = null
/** Общий кэш документов (id → DocRecord). */
const storeRef = new Map<string, DocRecord>()

/**
 * Возвращает текущий индекс MiniSearch.
 * @returns {MiniSearch<DocRecord> | null} Индекс или null, если ещё не создан.
 */
export function getIndex(): MiniSearch<DocRecord> | null {
	return indexRef
}

/**
 * Сохраняет общий экземпляр MiniSearch для использования в билдере и API.
 * @param {MiniSearch<DocRecord>} instance Экземпляр MiniSearch.
 * @returns {void}
 */
export function setIndex(instance: MiniSearch<DocRecord>): void {
	indexRef = instance
}

/**
 * Возвращает общий кэш документов.
 * @returns {Map<string, DocRecord>} Кэш документов (по id).
 */
export function getStore(): Map<string, DocRecord> {
	return storeRef
}

/**
 * Очищает общий кэш документов (перед полной перестройкой индекса).
 * @returns {void}
 */
export function resetStore(): void {
	storeRef.clear()
}
