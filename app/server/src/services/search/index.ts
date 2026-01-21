/**
 * Точка входа поискового сервиса.
 */

/**
 * Инициализация индекса и запуск вотчера файловой системы.
 * @returns {Promise<void>}
 */
export { buildSearchIndex } from './indexer.js'

/**
 * Поиск по собранному индексу.
 * @param {string} q Строка запроса.
 * @param {number} [limit=20] Максимум элементов в ответе.
 * @param {number} [offset=0] Смещение для пагинации.
 * @returns {import('../../types/services/search.service.js').SearchHit[]}
 */
export { searchInIndex } from './search.js'
