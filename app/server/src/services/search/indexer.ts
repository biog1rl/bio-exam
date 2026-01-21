import path from 'node:path'

import chokidar, { FSWatcher } from 'chokidar'
import MiniSearch from 'minisearch'

import { DOCS_ROOT, toPosix } from '../../config/docs.js'
import type { DocNode } from '../../types/services/docs.services.js'
import type { DocRecord } from '../../types/services/search.service.js'
import { ensureDocAccessLoaded } from '../docs/access-control.js'
import { getDocsTree } from '../docs/structure.js'
import { createDocRecord } from './records.js'
import { getIndex, getStore, resetStore, setIndex } from './state.js'
import { processTermAll, tokenizeUnicode } from './tokenize.js'

/** Регэксп для файлов markdown/mdx. */
const MARKDOWN_RX = /\.mdx?$/i
/** Игнор скрытых файлов и папок (.git, .idea и т.п.). */
const watcherIgnore = /(^|[/\\])\../

/** Единственный экземпляр файлового вотчера. */
let watcher: FSWatcher | null = null

/**
 * Обходит дерево документов и собирает относительные пути .md/.mdx.
 * @param {DocNode[]} nodes Узлы дерева из getDocsTree.
 * @param {string[]} [acc] Аккумулятор.
 * @returns {string[]} Список относительных путей.
 */
function collectDocPaths(nodes: DocNode[], acc: string[] = []): string[] {
	for (const node of nodes) {
		if (node.isDirectory) {
			if (node.children?.length) collectDocPaths(node.children, acc)
		} else {
			acc.push(node.path)
		}
	}
	return acc
}

/**
 * Создаёт вотчер один раз и вешает обработчики, чтобы держать индекс актуальным.
 * @param {MiniSearch<DocRecord>} index Экземпляр MiniSearch для обновления.
 * @returns {void}
 */
function ensureWatcher(index: MiniSearch<DocRecord>): void {
	if (watcher) return

	watcher = chokidar.watch(DOCS_ROOT, { ignoreInitial: true, ignored: watcherIgnore })
	watcher.on('add', (absPath) => handleChange(absPath, index))
	watcher.on('change', (absPath) => handleChange(absPath, index))
	watcher.on('unlink', handleRemove)
}

/** Проверяет, что имя файла не скрытое (не начинается с точки). */
const isVisibleFile = (name: string) => !name.startsWith('.')

/**
 * При добавлении/изменении md/mdx-файла пересобирает запись и обновляет индекс.
 * @param {string} absPath Абсолютный путь к файлу.
 * @param {MiniSearch<DocRecord>} index Индекс для добавления/замены записи.
 * @returns {void}
 */
function handleChange(absPath: string, index: MiniSearch<DocRecord>): void {
	const name = path.basename(absPath)
	if (!MARKDOWN_RX.test(name) || !isVisibleFile(name)) return

	const rel = toPosix(path.relative(DOCS_ROOT, absPath)).replace(MARKDOWN_RX, '')
	const record = createDocRecord(rel)
	if (!record) return

	const store = getStore()
	if (store.has(record.id)) index.replace(record)
	else index.add(record)
	store.set(record.id, record)
}

/**
 * При удалении md/mdx-файла убирает запись из хранилища и индекса.
 * @param {string} absPath Абсолютный путь к удалённому файлу.
 * @returns {void}
 */
function handleRemove(absPath: string): void {
	const name = path.basename(absPath)
	if (!MARKDOWN_RX.test(name)) return

	const rel = toPosix(path.relative(DOCS_ROOT, absPath)).replace(MARKDOWN_RX, '')
	getStore().delete(rel)

	const index = getIndex()
	if (index) index.remove({ id: rel } as any)
}

/**
 * Создаёт и наполняет MiniSearch-индекс по всем md/mdx-файлам и запускает вотчер.
 * Повторные вызовы возвращают уже созданный индекс.
 * @returns {Promise<MiniSearch<DocRecord>>}
 */
export async function buildSearchIndex(): Promise<MiniSearch<DocRecord>> {
	const existing = getIndex()
	if (existing) return existing

	const index = new MiniSearch<DocRecord>({
		fields: ['title', 'text', 'headings', 'tokens'],
		storeFields: ['id', 'rel', 'title', 'href'],
		tokenize: tokenizeUnicode,
		processTerm: processTermAll,
		searchOptions: {
			prefix: true,
			fuzzy: 0.2,
			boost: { title: 3, headings: 2, tokens: 2 },
		},
	})

	setIndex(index)
	resetStore()

	await ensureDocAccessLoaded()
	const { nodes } = getDocsTree('')
	const relFiles = collectDocPaths(nodes)

	const docs: DocRecord[] = []
	const store = getStore()
	for (const rel of relFiles) {
		const record = createDocRecord(rel)
		if (!record) continue
		docs.push(record)
		store.set(record.id, record)
	}

	if (docs.length) index.addAll(docs)
	ensureWatcher(index)

	return index
}
