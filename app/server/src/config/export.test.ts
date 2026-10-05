import assert from 'node:assert/strict'
import { afterEach, describe, test, vi } from 'vitest'

import { parseExportZipLimit } from './export.js'

const KEY = 'EXPORT_ZIP_MAX_BYTES'
const DEFAULT_LIMIT = { mode: 'buffer', limitBytes: 4_400_000 } as const

describe('parseExportZipLimit', () => {
	test('не задан, пустая строка и одни пробелы → буфер 4 400 000', () => {
		for (const raw of [undefined, '', '   ', '\t']) assert.deepEqual(parseExportZipLimit(raw), DEFAULT_LIMIT)
	})

	test('0 → поток без лимита', () => {
		assert.deepEqual(parseExportZipLimit('0'), { mode: 'stream' })
	})

	test('положительное целое → буфер с этим потолком', () => {
		assert.deepEqual(parseExportZipLimit('1000'), { mode: 'buffer', limitBytes: 1000 })
		assert.deepEqual(parseExportZipLimit('4400000'), DEFAULT_LIMIT)
	})

	test('иное значение → исключение с именем ключа', () => {
		for (const raw of ['-1', '1.5', 'abc', '4.4MB', ' 100', '100 ', '1e6', '99999999999999999999']) {
			assert.throws(() => parseExportZipLimit(raw), new RegExp(KEY), `value ${JSON.stringify(raw)}`)
		}
	})
})

describe('EXPORT_ZIP_LIMIT из окружения', () => {
	const previous = process.env.EXPORT_ZIP_MAX_BYTES

	afterEach(() => {
		if (previous === undefined) delete process.env.EXPORT_ZIP_MAX_BYTES
		else process.env.EXPORT_ZIP_MAX_BYTES = previous
		vi.resetModules()
	})

	test('без ключа константа равна лимиту ответа экспорта по умолчанию', async () => {
		delete process.env.EXPORT_ZIP_MAX_BYTES
		vi.resetModules()
		const { EXPORT_ZIP_LIMIT } = await import('./export.js')
		const { ZIP_RESPONSE_LIMIT_BYTES } = await import('../services/question-content/export.js')
		assert.deepEqual(EXPORT_ZIP_LIMIT, { mode: 'buffer', limitBytes: ZIP_RESPONSE_LIMIT_BYTES })
	})

	test('0 в окружении включает поток', async () => {
		process.env.EXPORT_ZIP_MAX_BYTES = '0'
		vi.resetModules()
		const { EXPORT_ZIP_LIMIT } = await import('./export.js')
		assert.deepEqual(EXPORT_ZIP_LIMIT, { mode: 'stream' })
	})

	test('неверное значение роняет загрузку модуля с именем ключа', async () => {
		process.env.EXPORT_ZIP_MAX_BYTES = '4.4MB'
		vi.resetModules()
		await assert.rejects(import('./export.js'), new RegExp(KEY))
	})
})
