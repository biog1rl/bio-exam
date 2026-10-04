import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { IP_TRUSTED, LOGIN_CAP_MS, bucketKeys, ipBlockMs, ipKey, loginBlockMs, pairBlockMs } from './progression.js'

describe('pairBlockMs', () => {
	test('при достоверном IP окно удваивается от 30 с до 15 мин', () => {
		const table: Array<[number, number]> = [
			[0, 0],
			[1, 0],
			[5, 0],
			[6, 30_000],
			[7, 60_000],
			[8, 120_000],
			[9, 240_000],
			[10, 480_000],
			[11, 900_000],
			[12, 900_000],
			[40, 900_000],
		]
		for (const [failures, expected] of table)
			assert.equal(pairBlockMs(failures, true), expected, `failures ${failures}`)
	})

	test('пока IP не подтверждён, потолок пары равен LOGIN_CAP_MS', () => {
		assert.equal(IP_TRUSTED, false)
		assert.equal(LOGIN_CAP_MS, 60_000)
		const table: Array<[number, number]> = [
			[0, 0],
			[5, 0],
			[6, 30_000],
			[7, 60_000],
			[8, 60_000],
			[11, 60_000],
			[40, 60_000],
		]
		for (const [failures, expected] of table) {
			assert.equal(pairBlockMs(failures, false), expected, `failures ${failures}`)
			assert.equal(pairBlockMs(failures), expected, `default, failures ${failures}`)
		}
	})
})

describe('loginBlockMs', () => {
	test('после 20 неудач окно 30 с, затем 60 с', () => {
		const table: Array<[number, number]> = [
			[0, 0],
			[20, 0],
			[21, 30_000],
			[22, 60_000],
			[30, 60_000],
			[500, 60_000],
		]
		for (const [failures, expected] of table) assert.equal(loginBlockMs(failures), expected, `failures ${failures}`)
	})
})

describe('ipBlockMs', () => {
	test('после 50 неудач окно удваивается от 30 с до 5 мин', () => {
		const table: Array<[number, number]> = [
			[50, 0],
			[51, 30_000],
			[52, 60_000],
			[54, 240_000],
			[55, 300_000],
			[90, 300_000],
		]
		for (const [failures, expected] of table) assert.equal(ipBlockMs(failures), expected, `failures ${failures}`)
	})
})

describe('bucketKeys', () => {
	test('без достоверного IP корзины IP нет', () => {
		const keys = bucketKeys('owner', '203.0.113.1', false).map((bucket) => bucket.key)
		assert.equal(keys.length, 2)
		assert.ok(!keys.includes(ipKey('203.0.113.1')))
		assert.deepEqual(
			bucketKeys('owner', '203.0.113.1').map((bucket) => bucket.key),
			keys
		)
	})

	test('при достоверном IP добавляется корзина IP без логина', () => {
		const buckets = bucketKeys('owner', '203.0.113.1', true)
		assert.equal(buckets.length, 3)
		const ipBucket = buckets.find((bucket) => bucket.key === ipKey('203.0.113.1'))
		assert.ok(ipBucket)
		assert.equal(ipBucket.kind, 'ip')
		assert.equal(ipBucket.login, null)
	})

	test('ключ пары не путает логин и IP с разделителем', () => {
		const a = bucketKeys('a:b', 'c', false).find((bucket) => bucket.kind === 'pair')
		const b = bucketKeys('a', 'b:c', false).find((bucket) => bucket.kind === 'pair')
		assert.notEqual(a?.key, b?.key)
	})
})
