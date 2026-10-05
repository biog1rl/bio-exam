import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { needsRefresh } from './access-token'

const NOW = 1_800_000_000

function encode(value: unknown): string {
	return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
}

function token(payload: unknown): string {
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('needsRefresh', () => {
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
		['TTL 60 с, только что выпущен', token({ sid: 's', iat: NOW, exp: NOW + 60 }), true, false],
		['TTL 60 с, exp − now = 31', token({ sid: 's', iat: NOW - 29, exp: NOW + 31 }), true, false],
		['TTL 60 с, exp − now = 30', token({ sid: 's', iat: NOW - 30, exp: NOW + 30 }), true, true],
		['TTL 900 с, exp − now = 61', token({ sid: 's', iat: NOW - 839, exp: NOW + 61 }), true, false],
		['TTL 900 с, exp − now = 60', token({ sid: 's', iat: NOW - 840, exp: NOW + 60 }), true, true],
		['TTL 100 с, exp − now = 50', token({ sid: 's', iat: NOW - 50, exp: NOW + 50 }), true, true],
		['TTL 100 с, exp − now = 51', token({ sid: 's', iat: NOW - 49, exp: NOW + 51 }), true, false],
		['iat не число: порог 60 с', token({ sid: 's', iat: 'x', exp: NOW + 60 }), true, true],
		['iat не раньше exp: порог 60 с', token({ sid: 's', iat: NOW + 60, exp: NOW + 60 }), true, true],
		['кириллица в payload разбирается', token({ sid: 's', exp: NOW + 600, login: 'студент' }), true, false],
		['пустой sid', token({ sid: '', exp: NOW + 600 }), true, true],
		['exp строкой', token({ sid: 's', exp: String(NOW + 600) }), true, true],
		['две части', `${encode({})}.${encode({ sid: 's', exp: NOW + 600 })}`, true, true],
		['пустая средняя часть', `${encode({})}..sig`, true, true],
		['не base64url', 'a.!!!.c', true, true],
		['не JSON', `a.${encode('not json')}.c`, true, true],
		['JSON-массив', `a.${encode([1, 2])}.c`, true, true],
		['JSON null', `a.${encode('null')}.c`, true, true],
	])('%s', (_name, accessToken, hasRefresh, expected) => {
		assert.equal(needsRefresh({ accessToken, hasRefresh, nowSec: NOW }), expected)
	})
})
