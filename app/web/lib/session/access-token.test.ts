import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { decodeAccessPayload, needsRefresh, REFRESH_THRESHOLD_SEC } from './access-token'

const NOW = 1_800_000_000

function encode(value: unknown): string {
	return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
}

function token(payload: unknown): string {
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('decodeAccessPayload', () => {
	test.each<[string, string | null | undefined, ReturnType<typeof decodeAccessPayload>]>([
		['sid и exp', token({ sub: 'u', sid: 's-1', exp: NOW }), { sid: 's-1', exp: NOW }],
		['без sid', token({ sub: 'u', exp: NOW }), { sid: null, exp: NOW }],
		['пустой sid', token({ sid: '', exp: NOW }), { sid: null, exp: NOW }],
		['exp строкой', token({ sid: 's', exp: String(NOW) }), { sid: 's', exp: null }],
		['кириллица в payload', token({ sid: 's', exp: NOW, login: 'студент' }), { sid: 's', exp: NOW }],
		['две части', `${encode({})}.${encode({ sid: 's' })}`, null],
		['пустая средняя часть', `${encode({})}..sig`, null],
		['не base64url', 'a.!!!.c', null],
		['не JSON', `a.${encode('not json')}.c`, null],
		['JSON-массив', `a.${encode([1, 2])}.c`, null],
		['JSON null', `a.${encode('null')}.c`, null],
		['пустая строка', '', null],
		['null', null, null],
		['undefined', undefined, null],
	])('%s', (_name, input, expected) => {
		assert.deepEqual(decodeAccessPayload(input), expected)
	})
})

describe('needsRefresh', () => {
	test('порог 60 с', () => {
		assert.equal(REFRESH_THRESHOLD_SEC, 60)
	})

	test.each<[string, string | null, boolean, boolean]>([
		['нет refresh, нет access', null, false, false],
		['нет refresh, access истёк', token({ sid: 's', exp: NOW - 10 }), false, false],
		['нет access', null, true, true],
		['пустой access', '', true, true],
		['payload не разбирается', 'garbage', true, true],
		['нет sid', token({ exp: NOW + 600 }), true, true],
		['нет exp', token({ sid: 's' }), true, true],
		['exp − now = 61', token({ sid: 's', exp: NOW + 61 }), true, false],
		['exp − now = 60', token({ sid: 's', exp: NOW + 60 }), true, true],
		['exp − now = 30', token({ sid: 's', exp: NOW + 30 }), true, true],
		['access истёк', token({ sid: 's', exp: NOW - 1 }), true, true],
		['exp через 10 минут', token({ sid: 's', exp: NOW + 600 }), true, false],
	])('%s', (_name, accessToken, hasRefresh, expected) => {
		assert.equal(needsRefresh({ accessToken, hasRefresh, nowSec: NOW }), expected)
	})
})
