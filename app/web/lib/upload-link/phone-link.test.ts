import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import type { RequestFailure } from '@/lib/http/request'

import { isInAppBrowser, phoneRefusalOf, phoneUploadUrl, readPhoneToken, type PhoneRefusal } from './phone-link'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd'.padEnd(43, 'x')
const OTHER = 'Z'.repeat(43)

function memoryStorage(initial: string | null) {
	const values = new Map<string, string>()
	if (initial !== null) values.set('photo-upload-token', initial)
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value)
		},
	}
}

describe('readPhoneToken', () => {
	test.each<[string, string, string | null, string | null, string | null]>([
		['фрагмент есть', `#${TOKEN}`, null, TOKEN, TOKEN],
		['только sessionStorage', '', TOKEN, TOKEN, TOKEN],
		['оба, фрагмент побеждает', `#${TOKEN}`, OTHER, TOKEN, TOKEN],
		['ничего', '', null, null, null],
		['неверная длина', `#${TOKEN.slice(1)}`, OTHER, null, OTHER],
		['недопустимые символы', `#${TOKEN.slice(1)}%`, null, null, null],
		['в sessionStorage мусор', '', 'abc', null, 'abc'],
	])('%s', (_name, hash, stored, expected, storedAfter) => {
		const storage = memoryStorage(stored)
		assert.equal(readPhoneToken(hash, storage), expected)
		assert.equal(storage.values.get('photo-upload-token') ?? null, storedAfter)
	})

	test('адрес телефона: путь и токен во фрагменте', () => {
		assert.equal(phoneUploadUrl('https://bio.example', TOKEN), `https://bio.example/photo-upload#${TOKEN}`)
	})
})

function http(status: number, body?: unknown): RequestFailure {
	return { ok: false, kind: 'http', status, body, message: '' }
}

describe('phoneRefusalOf', () => {
	test.each<[string, RequestFailure, PhoneRefusal | null]>([
		['404', http(404, { error: 'Ссылка недействительна' }), { kind: 'invalid' }],
		[
			'422 окно закрыто',
			http(422, { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: '2026-10-16T10:00:00.000Z' }),
			{ kind: 'closed', uploadClosesAt: '2026-10-16T10:00:00.000Z' },
		],
		['422 окна нет', http(422, { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null }), { kind: 'none' }],
		[
			'409 фото выключены',
			http(409, { error: 'К ответу на этот вопрос нельзя прикрепить фото' }),
			{ kind: 'forbidden' },
		],
		['409 лимит', http(409, { error: 'К ответу можно прикрепить не больше 5 фото' }), null],
		['422 другой', http(422, { error: 'OPEN_ANSWER_EMPTY' }), null],
		['500', http(500), null],
		['429', http(429), null],
		['сеть', { ok: false, kind: 'network', message: '' }, null],
	])('%s', (_name, failure, expected) => {
		assert.deepEqual(phoneRefusalOf(failure), expected)
	})
})

describe('isInAppBrowser', () => {
	test.each<[string, string, boolean]>([
		[
			'Telegram',
			'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.2.3',
			true,
		],
		[
			'VK',
			'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 VKAndroidApp/8.95-15890',
			true,
		],
		[
			'Instagram',
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.0',
			true,
		],
		[
			'Facebook',
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
			true,
		],
		[
			'приложение Яндекса',
			'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 YaApp_Android/24.80 YaSearchBrowser/24.80 Mobile Safari/537.36',
			true,
		],
		[
			'Chrome',
			'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
			false,
		],
		[
			'Safari',
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
			false,
		],
		[
			'YaBrowser',
			'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 YaBrowser/24.10.1 Mobile Safari/537.36',
			false,
		],
	])('%s → %s', (_name, userAgent, expected) => {
		assert.equal(isInAppBrowser(userAgent), expected)
	})
})
