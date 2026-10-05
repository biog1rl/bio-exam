import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	candidatesState,
	groupMembersSeed,
	groupSaveDisabled,
	groupSaveErrorText,
	groupSavePayload,
	groupsEmptyState,
	ownerLabel,
	personLabel,
} from './group-form'

test('groupSaveDisabled: правка группы ждёт свежего состава в этом открытии, новая группа не ждёт', () => {
	assert.equal(groupSaveDisabled({ saving: false, editing: true, membersReady: false }), true)
	assert.equal(groupSaveDisabled({ saving: false, editing: true, membersReady: true }), false)
	assert.equal(groupSaveDisabled({ saving: false, editing: false, membersReady: false }), false)
	assert.equal(groupSaveDisabled({ saving: true, editing: false, membersReady: false }), true)
	assert.equal(groupSaveDisabled({ saving: true, editing: true, membersReady: true }), true)
})

test('groupMembersSeed: состав засевается один раз на открытие из ответа для открытой группы', () => {
	const response = { id: 'g1', memberIds: ['u1', 'u2'] }
	assert.deepEqual(groupMembersSeed({ groupId: 'g1', seededFor: null, response }), ['u1', 'u2'])
	assert.equal(groupMembersSeed({ groupId: 'g1', seededFor: 'g1', response }), null)
	assert.deepEqual(groupMembersSeed({ groupId: 'g1', seededFor: 'g0', response }), ['u1', 'u2'])
})

test('groupMembersSeed: ответ для другой группы или без открытой группы не засевает', () => {
	const response = { id: 'g1', memberIds: ['u1'] }
	assert.equal(groupMembersSeed({ groupId: 'g2', seededFor: null, response }), null)
	assert.equal(groupMembersSeed({ groupId: null, seededFor: null, response }), null)
})

test('candidatesState: подсказка, поиск, ошибка, пусто и список', () => {
	const base = { query: 'Ан', debounced: 'Ан', loading: false, error: false, count: 0 }
	assert.equal(candidatesState({ ...base, query: 'А', debounced: 'А' }), 'hint')
	assert.equal(candidatesState({ ...base, debounced: 'А' }), 'loading')
	assert.equal(candidatesState({ ...base, loading: true }), 'loading')
	assert.equal(candidatesState({ ...base, error: true }), 'error')
	assert.equal(candidatesState(base), 'empty')
	assert.equal(candidatesState({ ...base, count: 3 }), 'list')
})

test('personLabel: имя из name, иначе имя и фамилия', () => {
	assert.equal(personLabel({ name: null, firstName: 'Анна', lastName: 'Иванова' }), 'Анна Иванова')
	assert.equal(personLabel({ name: 'Анна И.', firstName: 'Анна', lastName: 'Иванова' }), 'Анна И.')
	assert.equal(personLabel({ name: '  ', firstName: 'Анна', lastName: null }), 'Анна')
	assert.equal(personLabel({ name: null, firstName: null, lastName: null }), '—')
	assert.equal(personLabel({ name: 'Пётр' }), 'Пётр')
})

test('groupSaveErrorText: тексты ошибок сохранения группы', () => {
	assert.equal(groupSaveErrorText(400), 'В группу учителя можно добавить только учеников.')
	assert.equal(groupSaveErrorText(403), 'Недостаточно прав для этого действия. Обратитесь к администратору.')
	assert.equal(groupSaveErrorText(500), 'Не удалось сохранить. Попробуйте ещё раз.')
	assert.equal(groupSaveErrorText(404), 'Не удалось сохранить. Попробуйте ещё раз.')
	assert.equal(groupSaveErrorText(), 'Не удалось сохранить. Попробуйте ещё раз.')
})

test('groupSavePayload: ownerId только у администратора', () => {
	assert.deepEqual(groupSavePayload({ zoneAll: false, name: ' 9А ', memberIds: ['u1'], ownerId: 't1' }), {
		name: '9А',
		memberIds: ['u1'],
	})
	assert.ok(!('ownerId' in groupSavePayload({ zoneAll: false, name: '9А', memberIds: [], ownerId: null })))
	assert.deepEqual(groupSavePayload({ zoneAll: true, name: '9А', memberIds: [], ownerId: null }), {
		name: '9А',
		memberIds: [],
		ownerId: null,
	})
	assert.deepEqual(groupSavePayload({ zoneAll: true, name: '9А', memberIds: ['u1'], ownerId: 't1' }), {
		name: '9А',
		memberIds: ['u1'],
		ownerId: 't1',
	})
})

test('ownerLabel: администраторы или имя учителя', () => {
	assert.equal(ownerLabel(null), 'Администраторы')
	assert.equal(ownerLabel(undefined), 'Администраторы')
	assert.equal(
		ownerLabel({ id: 't1', name: 'Мария Петровна', firstName: 'Мария', lastName: 'Петрова' }),
		'Мария Петровна'
	)
	assert.equal(ownerLabel({ id: 't1', name: null, firstName: 'Мария', lastName: 'Петрова' }), 'Мария Петрова')
})

test('groupsEmptyState: пустое состояние учителя только без групп и без поиска', () => {
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '' }), 'teacher-empty')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '   ' }), 'teacher-empty')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 0, search: '9А' }), 'default')
	assert.equal(groupsEmptyState({ zoneAll: true, groups: 0, search: '' }), 'default')
	assert.equal(groupsEmptyState({ zoneAll: false, groups: 2, search: '' }), 'default')
})
