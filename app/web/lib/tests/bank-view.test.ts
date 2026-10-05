import type { PermissionKey } from '@bio-exam/rbac'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
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

test.each(
	[
		{
			name: 'zone.all и tests.write открывают каталог',
			keys: ['zone.all', 'tests.write', 'tests.read'],
			expected: true,
		},
		{ name: 'без zone.all каталог закрыт', keys: ['tests.write', 'tests.read', 'users.read'], expected: false },
		{ name: 'без tests.write каталог закрыт', keys: ['zone.all', 'tests.read'], expected: false },
		{ name: 'пустые права', keys: [], expected: false },
	].map((row): [string, typeof row] => [row.name, row])
)('canManageCatalog: %s', (_name, { keys, expected }) => {
	assert.equal(canManageCatalog(perms(...keys)), expected)
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

const TEACHERS_FAILED = 'Тема сохранена, но учителей закрепить не удалось. Откройте тему и попробуйте ещё раз.'

test.each(
	(
		[
			{
				name: 'учители не отправлялись — успех по режиму',
				cases: [
					[
						{ isEditing: false, teachersStatus: null },
						{ kind: 'success', message: 'Тема создана' },
					],
					[
						{ isEditing: true, teachersStatus: null },
						{ kind: 'success', message: 'Тема обновлена' },
					],
				],
			},
			{
				name: 'учители сохранены — успех',
				cases: [
					[
						{ isEditing: true, teachersStatus: 200 },
						{ kind: 'success', message: 'Тема обновлена' },
					],
				],
			},
			{
				name: 'тема сохранена, учители 400 — тост частичного сохранения',
				cases: [
					[
						{ isEditing: false, teachersStatus: 400 },
						{ kind: 'error', message: TEACHERS_FAILED },
					],
				],
			},
			{
				name: 'сбой сети и 5xx на учителях — тот же тост',
				cases: [
					[
						{ isEditing: true, teachersStatus: 0 },
						{ kind: 'error', message: TEACHERS_FAILED },
					],
					[
						{ isEditing: true, teachersStatus: 500 },
						{ kind: 'error', message: TEACHERS_FAILED },
					],
				],
			},
		] as { name: string; cases: [Parameters<typeof topicSaveOutcome>[0], ReturnType<typeof topicSaveOutcome>][] }[]
	).map(
		(
			row
		): [
			string,
			{ name: string; cases: [Parameters<typeof topicSaveOutcome>[0], ReturnType<typeof topicSaveOutcome>][] },
		] => [row.name, row]
	)
)('topicSaveOutcome: %s', (_name, { cases }) => {
	for (const [input, expected] of cases) assert.deepEqual(topicSaveOutcome(input), expected)
})

const DELETE_FAILED = 'Не удалось удалить тест. Попробуйте ещё раз.'
const SERVER_TEXT = 'У теста есть попытки учеников. Снимите публикацию или обратитесь к администратору'

test.each(
	(
		[
			{
				name: '200 и 204 — «Тест удален»',
				cases: [
					[200, undefined, { kind: 'success', message: 'Тест удален' }],
					[204, null, { kind: 'success', message: 'Тест удален' }],
				],
			},
			{
				name: '409 — текст error из тела без изменений',
				cases: [
					[409, { error: 'X' }, { kind: 'error', message: 'X' }],
					[409, { error: SERVER_TEXT }, { kind: 'error', message: SERVER_TEXT }],
				],
			},
			{
				name: '409 без текста — общий текст ошибки',
				cases: [
					[409, null, { kind: 'error', message: DELETE_FAILED }],
					[409, { error: '' }, { kind: 'error', message: DELETE_FAILED }],
					[409, { error: 42 }, { kind: 'error', message: DELETE_FAILED }],
				],
			},
			{
				name: '403 — недостаточно прав',
				cases: [
					[
						403,
						undefined,
						{ kind: 'error', message: 'Недостаточно прав для этого действия. Обратитесь к администратору.' },
					],
					[
						403,
						{ error: 'Forbidden' },
						{ kind: 'error', message: 'Недостаточно прав для этого действия. Обратитесь к администратору.' },
					],
				],
			},
			{
				name: 'прочее — общий текст ошибки',
				cases: [
					[500, undefined, { kind: 'error', message: DELETE_FAILED }],
					[404, { error: 'Not found' }, { kind: 'error', message: DELETE_FAILED }],
					[0, undefined, { kind: 'error', message: DELETE_FAILED }],
				],
			},
		] as { name: string; cases: [number, unknown, ReturnType<typeof deleteTestToast>][] }[]
	).map((row): [string, { name: string; cases: [number, unknown, ReturnType<typeof deleteTestToast>][] }] => [
		row.name,
		row,
	])
)('deleteTestToast: %s', (_name, { cases }) => {
	for (const [status, body, expected] of cases) assert.deepEqual(deleteTestToast(status, body), expected)
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
