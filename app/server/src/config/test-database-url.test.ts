import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'

import {
	assertTestDatabaseUrl,
	isIsolatedEnv,
	resolveIsolatedDatabaseUrl,
	withDatabaseName,
} from './test-database-url.js'

// Учётные данные в отклоняемых URL нарочно приметные: сообщение об ошибке не должно их содержать
const SECRET_USER = 'appuser_zq'
const SECRET_PASSWORD = 'pw_s3cret_zq'
const withSecrets = (rest: string) => `${rest.split('//')[0]}//${SECRET_USER}:${SECRET_PASSWORD}@${rest.split('//')[1]}`
// Текст фиксированный: в нём нет ни хоста, ни значений параметров
const QUERY_MESSAGE = /^TEST_DATABASE_URL must not contain a query string or fragment$/

describe('assertTestDatabaseUrl: допустимые адреса', () => {
	test.each([
		['postgres://postgres@127.0.0.1:5432/test_x'],
		['postgresql://u:p@localhost/test_bio_exam'],
		['postgres://postgres@localhost:55432/test_a1_b2'],
	])('принимает %s и возвращает строку без изменений', (url) => {
		assert.equal(assertTestDatabaseUrl(url), url)
	})
})

describe('assertTestDatabaseUrl: отклоняемые адреса', () => {
	test.each([
		['undefined', undefined, /is not set/],
		['пустая строка', '', /is not set/],
		['строка из пробелов', '   ', /is not set/],
		['не URL', 'not a url', /not a valid URL/],
		['протокол mysql', withSecrets('mysql://localhost/test_x'), /protocol mysql:/],
		['протокол http', withSecrets('http://localhost/test_x'), /protocol http:/],
		['чужой хост db.example.invalid', withSecrets('postgres://db.example.invalid/test_x'), /host db\.example\.invalid/],
		['соседний loopback 127.0.0.2', withSecrets('postgres://127.0.0.2/test_x'), /host 127\.0\.0\.2/],
		['база postgres', withSecrets('postgres://127.0.0.1/postgres'), /database postgres does not match/],
		['база prod', withSecrets('postgres://127.0.0.1/prod'), /database prod does not match/],
		['база Test_x (заглавная)', withSecrets('postgres://127.0.0.1/Test_x'), /database Test_x does not match/],
		['база test_ без суффикса', withSecrets('postgres://127.0.0.1/test_'), /does not match/],
		['база без имени', withSecrets('postgres://127.0.0.1'), /does not match/],
		['имя с дефисом', withSecrets('postgres://127.0.0.1/test_a-b'), /does not match/],
		// H-1: ?host= и ?hostaddr= переопределяют хост для node-postgres и libpq, ?sslmode= меняет подключение
		['?host= в строке запроса', withSecrets('postgres://127.0.0.1:5432/test_x?host=db.example.invalid'), QUERY_MESSAGE],
		['?hostaddr= в строке запроса', withSecrets('postgres://127.0.0.1:5432/test_x?hostaddr=1.2.3.4'), QUERY_MESSAGE],
		['?sslmode= в строке запроса', withSecrets('postgres://localhost/test_x?sslmode=disable'), QUERY_MESSAGE],
		['фрагмент', withSecrets('postgres://127.0.0.1/test_x#db.example.invalid'), QUERY_MESSAGE],
	])('отклоняет: %s', (_label, url, message) => {
		expect(() => assertTestDatabaseUrl(url)).toThrow(message)
	})

	test.each([
		['чужой хост', withSecrets('postgres://db.example.invalid/test_x')],
		['протокол mysql', withSecrets('mysql://localhost/test_x')],
		['база prod', withSecrets('postgres://127.0.0.1/prod')],
		['некорректный URL', `postgres://${SECRET_USER}:${SECRET_PASSWORD}@[::1`],
		['?host=', withSecrets('postgres://127.0.0.1/test_x?host=db.example.invalid')],
		['?hostaddr=', withSecrets('postgres://127.0.0.1/test_x?hostaddr=1.2.3.4')],
		['?sslmode=', withSecrets('postgres://127.0.0.1/test_x?sslmode=disable')],
	])('сообщение об отказе (%s) не содержит пользователя и пароль', (_label, url) => {
		let message = ''
		try {
			assertTestDatabaseUrl(url)
		} catch (error) {
			message = error instanceof Error ? error.message : String(error)
		}
		assert.notEqual(message, '', 'ожидали отказ')
		assert.ok(!message.includes(SECRET_USER), 'в сообщении есть имя пользователя')
		assert.ok(!message.includes(SECRET_PASSWORD), 'в сообщении есть пароль')
	})
})

describe('resolveIsolatedDatabaseUrl', () => {
	test('DATABASE_URL никогда не запасной вариант', () => {
		expect(() =>
			resolveIsolatedDatabaseUrl({
				TEST_DATABASE_URL: undefined,
				DATABASE_URL: 'postgres://u@127.0.0.1/test_x',
			})
		).toThrow(/is not set/)
	})

	test('пустой TEST_DATABASE_URL отклоняется, DATABASE_URL не подставляется', () => {
		expect(() =>
			resolveIsolatedDatabaseUrl({
				TEST_DATABASE_URL: '',
				DATABASE_URL: 'postgres://u@127.0.0.1/test_x',
			})
		).toThrow(/is not set/)
	})

	test('TEST_DATABASE_URL читается, а DATABASE_URL с боевым адресом игнорируется', () => {
		assert.equal(
			resolveIsolatedDatabaseUrl({
				TEST_DATABASE_URL: 'postgres://u@127.0.0.1:5/test_a',
				DATABASE_URL: 'postgres://u@db.example.invalid/prod',
			}),
			'postgres://u@127.0.0.1:5/test_a'
		)
	})

	test('недопустимый TEST_DATABASE_URL отклоняется той же проверкой', () => {
		expect(() => resolveIsolatedDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u@db.example.invalid/test_x' })).toThrow(
			/host db\.example\.invalid/
		)
	})
})

describe('withDatabaseName', () => {
	test('подменяет имя базы и сохраняет остальной адрес', () => {
		const result = withDatabaseName('postgres://u@127.0.0.1:5/test_a', 'test_b')
		const parsed = new URL(result)
		assert.equal(parsed.pathname, '/test_b')
		assert.equal(parsed.hostname, '127.0.0.1')
		assert.equal(parsed.port, '5')
		assert.equal(parsed.username, 'u')
	})

	test('повторно применяет проверку к новому имени: prod отклоняется', () => {
		expect(() => withDatabaseName('postgres://u@127.0.0.1:5/test_a', 'prod')).toThrow(/database prod does not match/)
	})

	test('исходный адрес тоже проверяется', () => {
		expect(() => withDatabaseName('postgres://u@db.example.invalid/test_a', 'test_b')).toThrow(
			/host db\.example\.invalid/
		)
	})
})

describe('isIsolatedEnv', () => {
	test.each([
		['1', true],
		['0', false],
		['true', false],
		['', false],
		[undefined, false],
	])('BIO_EXAM_ISOLATED_ENV=%s даёт %s', (value, expected) => {
		assert.equal(isIsolatedEnv({ BIO_EXAM_ISOLATED_ENV: value }), expected)
	})

	test('пустое окружение не включает изоляцию', () => {
		assert.equal(isIsolatedEnv({}), false)
	})
})
