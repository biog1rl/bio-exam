import type { PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	DELETE_TEST_FAILED,
	DELETE_TEST_FORBIDDEN,
	TEACHERS_SAVE_FAILED,
	canManageCatalog,
	deleteTestToast,
	emptyBankState,
	teacherDisplayName,
	teacherTriggerLabel,
	teachersCountLabel,
	teachersLine,
	teachersSetChanged,
	testTopicPickerState,
	topicHeroTeachersLine,
	topicPageState,
	topicSaveFailure,
	topicSaveOutcome,
} from './bank-view'

const anna = { id: 'a', name: 'anna', firstName: 'Анна', lastName: 'Иванова' }
const boris = { id: 'b', name: 'boris', firstName: 'Борис', lastName: 'Петров' }
const vera = { id: 'v', name: 'vera', firstName: 'Вера', lastName: 'Смирнова' }

function perms(...keys: string[]): ReadonlySet<PermissionKey> {
	return new Set(keys as PermissionKey[])
}

test('canManageCatalog: zone.all и tests.write открывают каталог', () => {
	assert.equal(canManageCatalog(perms('zone.all', 'tests.write', 'tests.read')), true)
})

test('canManageCatalog: без zone.all каталог закрыт', () => {
	assert.equal(canManageCatalog(perms('tests.write', 'tests.read', 'users.read')), false)
})

test('canManageCatalog: без tests.write каталог закрыт', () => {
	assert.equal(canManageCatalog(perms('zone.all', 'tests.read')), false)
})

test('canManageCatalog: пустые права', () => {
	assert.equal(canManageCatalog(perms()), false)
})

test.each<[{ topicFound: boolean; zoneAll: boolean }, string]>([
	[{ topicFound: false, zoneAll: false }, 'denied'],
	[{ topicFound: false, zoneAll: true }, 'missing'],
	[{ topicFound: true, zoneAll: false }, 'ok'],
	[{ topicFound: true, zoneAll: true }, 'ok'],
])('topicPageState(%o) → %s', (input, expected) => {
	assert.equal(topicPageState(input), expected)
})

test('teacherDisplayName: имя и фамилия, иначе name, иначе тире', () => {
	assert.equal(teacherDisplayName(anna), 'Анна Иванова')
	assert.equal(teacherDisplayName({ id: 'x', name: 'login-name', firstName: null, lastName: null }), 'login-name')
	assert.equal(teacherDisplayName({ id: 'x', name: null, firstName: null, lastName: null }), '—')
	assert.equal(teacherDisplayName({ id: 'x', name: null, firstName: 'Анна', lastName: null }), 'Анна')
})

test('teachersLine: пусто, один, несколько', () => {
	assert.equal(teachersLine([]), 'Без учителя')
	assert.equal(teachersLine([anna]), 'Учитель: Анна Иванова')
	assert.equal(teachersLine([anna, boris, vera]), 'Учителя: 3')
	assert.equal(teachersLine([anna, boris]), 'Учителя: 2')
})

test.each<[number, string]>([
	[1, '1 учитель'],
	[2, '2 учителя'],
	[4, '4 учителя'],
	[5, '5 учителей'],
	[11, '11 учителей'],
	[12, '12 учителей'],
	[21, '21 учитель'],
	[22, '22 учителя'],
	[25, '25 учителей'],
	[111, '111 учителей'],
])('teachersCountLabel(%i) → %s', (count, label) => {
	assert.equal(teachersCountLabel(count), label)
})

test('topicHeroTeachersLine: пусто, один, несколько', () => {
	assert.equal(topicHeroTeachersLine([]), 'Учитель не закреплён')
	assert.equal(topicHeroTeachersLine([anna]), 'Учитель: Анна Иванова')
	assert.equal(topicHeroTeachersLine([anna, boris]), 'Учителя: Анна Иванова, Борис Петров')
})

test('teacherTriggerLabel: пусто, один, несколько', () => {
	assert.equal(teacherTriggerLabel([]), 'Выберите учителей')
	assert.equal(teacherTriggerLabel([anna]), 'Анна Иванова')
	assert.equal(teacherTriggerLabel([anna, boris]), '2 учителя')
	assert.equal(teacherTriggerLabel([anna, boris, vera, anna, boris]), '5 учителей')
})

test('teachersSetChanged: порядок не важен, состав важен', () => {
	assert.equal(teachersSetChanged(['a', 'b'], ['b', 'a']), false)
	assert.equal(teachersSetChanged(['a'], ['a', 'b']), true)
	assert.equal(teachersSetChanged(['a', 'b'], ['a']), true)
	assert.equal(teachersSetChanged([], []), false)
	assert.equal(teachersSetChanged(['a'], ['b']), true)
})

test('topicSaveOutcome: учители не отправлялись — успех по режиму', () => {
	assert.deepEqual(topicSaveOutcome({ isEditing: false, teachersStatus: null }), {
		kind: 'success',
		message: 'Тема создана',
	})
	assert.deepEqual(topicSaveOutcome({ isEditing: true, teachersStatus: null }), {
		kind: 'success',
		message: 'Тема обновлена',
	})
})

test('topicSaveOutcome: учители сохранены — успех', () => {
	assert.deepEqual(topicSaveOutcome({ isEditing: true, teachersStatus: 200 }), {
		kind: 'success',
		message: 'Тема обновлена',
	})
})

test('topicSaveOutcome: тема сохранена, учители 400 — тост частичного сохранения', () => {
	assert.equal(
		TEACHERS_SAVE_FAILED,
		'Тема сохранена, но учителей закрепить не удалось. Откройте тему и попробуйте ещё раз.'
	)
	assert.deepEqual(topicSaveOutcome({ isEditing: false, teachersStatus: 400 }), {
		kind: 'error',
		message: TEACHERS_SAVE_FAILED,
	})
})

test('topicSaveOutcome: сбой сети и 5xx на учителях — тот же тост', () => {
	assert.deepEqual(topicSaveOutcome({ isEditing: true, teachersStatus: 0 }), {
		kind: 'error',
		message: TEACHERS_SAVE_FAILED,
	})
	assert.deepEqual(topicSaveOutcome({ isEditing: true, teachersStatus: 500 }), {
		kind: 'error',
		message: TEACHERS_SAVE_FAILED,
	})
})

test('deleteTestToast: 200 и 204 — «Тест удален»', () => {
	assert.deepEqual(deleteTestToast(200), { kind: 'success', message: 'Тест удален' })
	assert.deepEqual(deleteTestToast(204, null), { kind: 'success', message: 'Тест удален' })
})

test('deleteTestToast: 409 — текст error из тела без изменений', () => {
	assert.deepEqual(deleteTestToast(409, { error: 'X' }), { kind: 'error', message: 'X' })
	const serverText = 'У теста есть попытки учеников. Снимите публикацию или обратитесь к администратору'
	assert.deepEqual(deleteTestToast(409, { error: serverText }), { kind: 'error', message: serverText })
})

test('deleteTestToast: 409 без текста — общий текст ошибки', () => {
	assert.deepEqual(deleteTestToast(409, null), { kind: 'error', message: DELETE_TEST_FAILED })
	assert.deepEqual(deleteTestToast(409, { error: '' }), { kind: 'error', message: DELETE_TEST_FAILED })
	assert.deepEqual(deleteTestToast(409, { error: 42 }), { kind: 'error', message: DELETE_TEST_FAILED })
})

test('deleteTestToast: 403 — недостаточно прав', () => {
	assert.equal(DELETE_TEST_FORBIDDEN, 'Недостаточно прав для этого действия. Обратитесь к администратору.')
	assert.deepEqual(deleteTestToast(403), { kind: 'error', message: DELETE_TEST_FORBIDDEN })
	assert.deepEqual(deleteTestToast(403, { error: 'Forbidden' }), { kind: 'error', message: DELETE_TEST_FORBIDDEN })
})

test('deleteTestToast: прочее — общий текст ошибки', () => {
	assert.equal(DELETE_TEST_FAILED, 'Не удалось удалить тест. Попробуйте ещё раз.')
	assert.deepEqual(deleteTestToast(500), { kind: 'error', message: DELETE_TEST_FAILED })
	assert.deepEqual(deleteTestToast(404, { error: 'Not found' }), { kind: 'error', message: DELETE_TEST_FAILED })
	assert.deepEqual(deleteTestToast(0), { kind: 'error', message: DELETE_TEST_FAILED })
})

test.each<[{ topics: number; zoneAll: boolean }, string]>([
	[{ topics: 0, zoneAll: false }, 'teacher-no-topics'],
	[{ topics: 0, zoneAll: true }, 'admin-empty'],
	[{ topics: 2, zoneAll: false }, 'has-topics'],
	[{ topics: 1, zoneAll: true }, 'has-topics'],
])('emptyBankState(%o) → %s', (input, expected) => {
	assert.equal(emptyBankState(input), expected)
})

test.each<[{ topics: number; canManage: boolean }, string]>([
	[{ topics: 0, canManage: false }, 'ask-admin'],
	[{ topics: 0, canManage: true }, 'create-first'],
	[{ topics: 3, canManage: false }, 'list'],
	[{ topics: 3, canManage: true }, 'list'],
])('testTopicPickerState(%o) → %s', (input, expected) => {
	assert.equal(testTopicPickerState(input), expected)
})

test('topicSaveFailure: 409 с английским текстом сервера — русская ошибка у поля адреса, без тоста', () => {
	assert.deepEqual(
		topicSaveFailure({
			ok: false,
			kind: 'http',
			status: 409,
			message: 'Topic with this slug already exists',
			body: { error: 'Topic with this slug already exists' },
		}),
		{ slugError: 'Тема с таким адресом уже существует', toast: '' }
	)
})

test('topicSaveFailure: прочие отказы — тост с запасным текстом, поле адреса не трогается', () => {
	assert.deepEqual(topicSaveFailure({ ok: false, kind: 'http', status: 500, message: 'x' }), {
		slugError: null,
		toast: 'Ошибка сохранения',
	})
	assert.deepEqual(
		topicSaveFailure({ ok: false, kind: 'http', status: 400, message: 'x', body: { error: 'Invalid body' } }),
		{ slugError: null, toast: 'Ошибка сохранения' }
	)
	assert.deepEqual(topicSaveFailure({ ok: false, kind: 'auth', status: 401, message: 'x' }), {
		slugError: null,
		toast: '',
	})
})
