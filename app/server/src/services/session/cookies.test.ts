import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'vitest'

import { AUTH_CONFIG, parseAccessTokenTtl, parseDays } from '../../config/auth.js'
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	appendSetCookie,
	clearSessionCookies,
	readCookie,
	setSessionCookies,
} from './cookies.js'

function fakeResponse(initial?: string | string[]) {
	let stored: string | string[] | undefined = initial
	return {
		getHeader: (name: string) => (name.toLowerCase() === 'set-cookie' ? stored : undefined),
		setHeader(name: string, value: string[]) {
			if (name.toLowerCase() === 'set-cookie') stored = [...value]
			return this
		},
		cookies(): string[] {
			if (stored === undefined) return []
			return Array.isArray(stored) ? stored : [stored]
		},
	}
}

function attributesOf(line: string): { name: string; value: string; attributes: string[] } {
	const [pair = '', ...rest] = line.split(';').map((part) => part.trim())
	const eq = pair.indexOf('=')
	return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes: rest }
}

function byName(lines: string[], name: string) {
	const found = lines.map(attributesOf).find((cookie) => cookie.name === name)
	assert.ok(found, `${name} is not set`)
	return found
}

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
	if (originalNodeEnv === undefined) delete process.env.NODE_ENV
	else process.env.NODE_ENV = originalNodeEnv
})

describe('appendSetCookie', () => {
	test('дописывает к одной ранее выставленной строке', () => {
		const res = fakeResponse('first=1; Path=/')
		appendSetCookie(res, 'second=2; Path=/')
		assert.deepEqual(res.cookies(), ['first=1; Path=/', 'second=2; Path=/'])
	})

	test('дописывает к массиву и к пустому заголовку', () => {
		const res = fakeResponse(['a=1', 'b=2'])
		appendSetCookie(res, 'c=3')
		assert.deepEqual(res.cookies(), ['a=1', 'b=2', 'c=3'])
		const empty = fakeResponse()
		appendSetCookie(empty, 'only=1')
		assert.deepEqual(empty.cookies(), ['only=1'])
	})

	test('setSessionCookies и clearSessionCookies не затирают чужие cookie', () => {
		const res = fakeResponse('other=1; Path=/')
		setSessionCookies(res, { accessToken: 'access', refreshToken: 'refresh' })
		clearSessionCookies(res)
		assert.deepEqual(
			res.cookies().map((line) => attributesOf(line).name),
			['other', ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_COOKIE, REFRESH_COOKIE]
		)
	})
})

describe('атрибуты cookie сессии', () => {
	test('access и refresh: Path=/, HttpOnly, SameSite=Lax, Max-Age из конфига, без Secure вне production', () => {
		process.env.NODE_ENV = 'development'
		const res = fakeResponse()
		setSessionCookies(res, { accessToken: 'access-value', refreshToken: 'refresh-value' })
		const access = byName(res.cookies(), ACCESS_COOKIE)
		const refresh = byName(res.cookies(), REFRESH_COOKIE)
		assert.equal(access.value, 'access-value')
		assert.equal(refresh.value, 'refresh-value')
		assert.deepEqual(access.attributes, [
			'Path=/',
			'HttpOnly',
			'SameSite=Lax',
			`Max-Age=${AUTH_CONFIG.accessTokenTtlSec}`,
		])
		assert.deepEqual(refresh.attributes, [
			'Path=/',
			'HttpOnly',
			'SameSite=Lax',
			`Max-Age=${AUTH_CONFIG.refreshTokenTtlDays * 24 * 60 * 60}`,
		])
	})

	test('без refreshToken выставляется только access', () => {
		const res = fakeResponse()
		setSessionCookies(res, { accessToken: 'access-only' })
		assert.deepEqual(
			res.cookies().map((line) => attributesOf(line).name),
			[ACCESS_COOKIE]
		)
	})

	test('Secure только при NODE_ENV=production', () => {
		process.env.NODE_ENV = 'production'
		const prod = fakeResponse()
		setSessionCookies(prod, { accessToken: 'a', refreshToken: 'r' })
		clearSessionCookies(prod)
		assert.ok(prod.cookies().every((line) => attributesOf(line).attributes.includes('Secure')))

		process.env.NODE_ENV = 'test'
		const nonProd = fakeResponse()
		setSessionCookies(nonProd, { accessToken: 'a', refreshToken: 'r' })
		clearSessionCookies(nonProd)
		assert.ok(nonProd.cookies().every((line) => !attributesOf(line).attributes.includes('Secure')))
	})

	test('очистка: обе cookie с пустым значением, Max-Age=0 и только Path=/', () => {
		process.env.NODE_ENV = 'development'
		const res = fakeResponse()
		clearSessionCookies(res)
		const lines = res.cookies()
		assert.equal(lines.length, 2)
		for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
			const cookie = byName(lines, name)
			assert.equal(cookie.value, '')
			assert.deepEqual(cookie.attributes, ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'])
		}
		assert.ok(lines.every((line) => !line.includes('/api/auth/refresh')))
	})
})

describe('readCookie', () => {
	test('находит cookie по имени и декодирует значение', () => {
		const req = { headers: { cookie: `x=1; ${ACCESS_COOKIE}=a%20b; ${REFRESH_COOKIE}=r=1` } }
		assert.equal(readCookie(req, ACCESS_COOKIE), 'a b')
		assert.equal(readCookie(req, REFRESH_COOKIE), 'r=1')
		assert.equal(readCookie(req, 'missing'), null)
		assert.equal(readCookie({ headers: {} }, ACCESS_COOKIE), null)
		assert.equal(readCookie({ headers: { cookie: `${ACCESS_COOKIE}=%E0%A4%A` } }, ACCESS_COOKIE), null)
	})
})

describe('parseAccessTokenTtl', () => {
	test('без значения 900 секунд', () => {
		assert.equal(parseAccessTokenTtl(undefined), 900)
	})

	for (const [raw, expected] of [
		['60', 60],
		['900', 900],
		['3600', 3600],
	] as const) {
		test(`${raw} принимается`, () => {
			assert.equal(parseAccessTokenTtl(raw), expected)
		})
	}

	for (const raw of ['59', '3601', '15m', '', '0', '-60', '60.5', ' 900', '2592000']) {
		test(`${JSON.stringify(raw)} даёт ошибку с именем ключа`, () => {
			assert.throws(() => parseAccessTokenTtl(raw), /ACCESS_TOKEN_EXPIRES_SEC/)
		})
	}

	test('срок access в конфиге тестового процесса — значение по умолчанию', () => {
		assert.equal(AUTH_CONFIG.accessTokenTtlSec, parseAccessTokenTtl(process.env.ACCESS_TOKEN_EXPIRES_SEC))
	})
})

describe('parseDays', () => {
	test('без значения — значение по умолчанию', () => {
		assert.equal(parseDays('REFRESH_TOKEN_EXPIRES_DAYS', undefined, 30), 30)
		assert.equal(parseDays('SESSION_MAX_AGE_DAYS', undefined, 7), 7)
	})

	for (const [raw, expected] of [
		['1', 1],
		['30', 30],
		['365', 365],
	] as const) {
		test(`${raw} принимается`, () => {
			assert.equal(parseDays('REFRESH_TOKEN_EXPIRES_DAYS', raw, 30), expected)
		})
	}

	for (const key of ['REFRESH_TOKEN_EXPIRES_DAYS', 'SESSION_MAX_AGE_DAYS']) {
		for (const raw of ['', '30d', '0', '-1', '1.5', ' 30', '366', 'NaN']) {
			test(`${key}=${JSON.stringify(raw)} даёт ошибку с именем ключа`, () => {
				assert.throws(() => parseDays(key, raw, 30), new RegExp(key))
			})
		}
	}

	test('сроки refresh и сессии в конфиге тестового процесса — целые дни', () => {
		assert.ok(Number.isInteger(AUTH_CONFIG.refreshTokenTtlDays))
		assert.ok(Number.isInteger(AUTH_CONFIG.sessionMaxAgeDays))
	})
})
