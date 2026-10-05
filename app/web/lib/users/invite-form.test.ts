import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	defaultGroupId,
	defaultRoleKey,
	groupOptionLabel,
	groupsCell,
	groupsTitle,
	inviteErrorText,
	invitePayload,
	matchesGroup,
	parseInviteGroups,
	reinviteErrorText,
	showGroupField,
	showReinvite,
	usersEmptyText,
} from './invite-form'

test('inviteErrorText: 400 просит проверить имя, логин и группу', () => {
	assert.equal(inviteErrorText({ status: 400 }), 'Проверьте имя, логин и группу.')
	assert.equal(
		inviteErrorText({ status: 400, body: { error: 'Login is invalid' }, variant: 'teacher' }),
		'Проверьте имя, логин и группу.'
	)
})

test('inviteErrorText: 403 зависит от варианта диалога', () => {
	assert.equal(
		inviteErrorText({ status: 403, variant: 'teacher' }),
		'Нельзя пригласить в эту группу. Выберите свою группу.'
	)
	assert.equal(
		inviteErrorText({ status: 403, variant: 'admin' }),
		'Недостаточно прав для этого действия. Обратитесь к администратору.'
	)
})

test('inviteErrorText: 409 отдаёт текст сервера без изменений', () => {
	assert.equal(inviteErrorText({ status: 409, body: { error: 'X' } }), 'X')
	assert.equal(inviteErrorText({ status: 409, body: null }), 'Не удалось создать приглашение. Попробуйте ещё раз.')
	assert.equal(
		inviteErrorText({ status: 409, body: { error: '  ' } }),
		'Не удалось создать приглашение. Попробуйте ещё раз.'
	)
})

test('inviteErrorText: 5xx и прочие коды дают общий текст, английский текст сервера не показывается', () => {
	assert.equal(inviteErrorText({ status: 502 }), 'Не удалось создать приглашение. Попробуйте ещё раз.')
	assert.equal(
		inviteErrorText({ status: 500, body: { error: 'Failed to create or find user' } }),
		'Не удалось создать приглашение. Попробуйте ещё раз.'
	)
	assert.equal(
		inviteErrorText({ status: 404, body: { error: 'Group not found' } }),
		'Не удалось создать приглашение. Попробуйте ещё раз.'
	)
})

test('inviteErrorText: сбой сети', () => {
	assert.equal(inviteErrorText({ network: true }), 'Не удалось связаться с сервером. Проверьте соединение.')
})

test('showReinvite: учитель — только неактивированному, администратор — любому неактивному', () => {
	const pending = { isActive: false, activatedAt: null }
	const deactivated = { isActive: false, activatedAt: '2026-10-01T10:00:00.000Z' }
	const active = { isActive: true, activatedAt: '2026-10-01T10:00:00.000Z' }
	assert.equal(showReinvite(pending, { canInvite: true, zoneAll: false }), true)
	assert.equal(showReinvite(deactivated, { canInvite: true, zoneAll: false }), false)
	assert.equal(showReinvite(active, { canInvite: true, zoneAll: false }), false)
	assert.equal(showReinvite(pending, { canInvite: true, zoneAll: true }), true)
	assert.equal(showReinvite(deactivated, { canInvite: true, zoneAll: true }), true)
	assert.equal(showReinvite(active, { canInvite: true, zoneAll: true }), false)
	assert.equal(showReinvite(pending, { canInvite: false, zoneAll: true }), false)
	assert.equal(showReinvite(pending, { canInvite: false, zoneAll: false }), false)
})

test('reinviteErrorText: 403 и 409 по UI-SPEC, остальное как раньше', () => {
	assert.equal(
		reinviteErrorText({ status: 403, text: '{"error":"Forbidden"}' }),
		'Недостаточно прав для этого действия. Обратитесь к администратору.'
	)
	assert.equal(
		reinviteErrorText({
			status: 409,
			text: '{"error":"Пользователь уже активен: приглашение выдаётся только неактивному пользователю"}',
		}),
		'Пользователь уже активен: приглашение выдаётся только неактивному пользователю'
	)
	assert.equal(reinviteErrorText({ status: 409, text: 'conflict' }), 'conflict')
	assert.equal(reinviteErrorText({ status: 500, text: 'boom' }), 'boom')
	assert.equal(reinviteErrorText({ status: 502, text: '' }), 'HTTP 502')
})

test('invitePayload: учитель отправляет группу и не отправляет роль', () => {
	const payload = invitePayload({ variant: 'teacher', groupId: 'g', role: 'any' })
	assert.equal('roleKey' in payload, false)
	assert.equal(payload.groupId, 'g')
})

test('invitePayload: администратор отправляет роль, группу только если выбрана', () => {
	const withoutGroup = invitePayload({ variant: 'admin', role: 'r', groupId: null })
	assert.equal(withoutGroup.roleKey, 'r')
	assert.equal('groupId' in withoutGroup, false)

	const withGroup = invitePayload({
		variant: 'admin',
		role: 'r',
		groupId: 'g',
		login: 'ivan',
		firstName: 'Иван',
		lastName: 'Иванов',
	})
	assert.deepEqual(withGroup, { login: 'ivan', firstName: 'Иван', lastName: 'Иванов', roleKey: 'r', groupId: 'g' })
})

test('defaultGroupId: одна группа выбрана сразу, иначе ничего', () => {
	assert.equal(defaultGroupId([{ id: 'g' }]), 'g')
	assert.equal(defaultGroupId([{ id: 'g1' }, { id: 'g2' }]), null)
	assert.equal(defaultGroupId([]), null)
})

test('defaultRoleKey: роль с groupMember, без признаков роли нет', () => {
	assert.equal(
		defaultRoleKey([
			{ key: 'a', groupMember: false },
			{ key: 'b', groupMember: false },
			{ key: 'c', groupMember: true },
		]),
		'c'
	)
	assert.equal(
		defaultRoleKey([
			{ key: 'a', groupMember: null },
			{ key: 'c', groupMember: null },
		]),
		null
	)
})

test('showGroupField: поле группы для роли с groupMember и при незагруженных признаках', () => {
	assert.equal(showGroupField(true), true)
	assert.equal(showGroupField(null), true)
	assert.equal(showGroupField(undefined), true)
	assert.equal(showGroupField(false), false)
})

test('groupsCell: до двух названий через запятую, дальше +n', () => {
	assert.equal(groupsCell([]), '—')
	assert.equal(groupsCell([{ id: '1', name: 'А' }]), 'А')
	assert.equal(
		groupsCell([
			{ id: '1', name: 'А' },
			{ id: '2', name: 'Б' },
		]),
		'А, Б'
	)
	assert.equal(
		groupsCell([
			{ id: '1', name: 'А' },
			{ id: '2', name: 'Б' },
			{ id: '3', name: 'В' },
			{ id: '4', name: 'Г' },
		]),
		'А, Б +2'
	)
})

test('groupsTitle: полный список через запятую', () => {
	assert.equal(groupsTitle([]), '')
	assert.equal(
		groupsTitle([
			{ id: '1', name: 'А' },
			{ id: '2', name: 'Б' },
			{ id: '3', name: 'В' },
			{ id: '4', name: 'Г' },
		]),
		'А, Б, В, Г'
	)
})

test('matchesGroup: членство в любой из групп строки', () => {
	const row = {
		groups: [
			{ id: 'g1', name: 'Первая' },
			{ id: 'g2', name: 'Вторая' },
		],
	}
	assert.equal(matchesGroup(row, 'g2'), true)
	assert.equal(matchesGroup(row, 'g1'), true)
	assert.equal(matchesGroup(row, 'all'), true)
	assert.equal(matchesGroup(row, 'g3'), false)
	assert.equal(matchesGroup({ groups: [] }, 'g1'), false)
	assert.equal(matchesGroup({ groups: [] }, 'all'), true)
})

test('groupOptionLabel: владелец или администраторы', () => {
	assert.equal(groupOptionLabel({ name: 'G', owner: null }), 'G · администраторы')
	assert.equal(
		groupOptionLabel({ name: 'G', owner: { id: 't', name: 'anna', firstName: 'Анна', lastName: 'Иванова' } }),
		'G · Анна Иванова'
	)
	assert.equal(
		groupOptionLabel({ name: 'G', owner: { id: 't', name: 'anna', firstName: null, lastName: null } }),
		'G · anna'
	)
	assert.equal(groupOptionLabel({ name: 'G' }), 'G')
})

test('parseInviteGroups: только записи с id и name, иначе пустой список', () => {
	assert.deepEqual(parseInviteGroups(undefined), [])
	assert.deepEqual(parseInviteGroups({ error: 'Forbidden' }), [])
	assert.deepEqual(
		parseInviteGroups({
			groups: [
				{ id: 'g1', name: 'Первая', memberCount: 2, owner: null },
				{ id: 'g2', name: 'Вторая', memberCount: 0 },
				{ id: 3, name: 'плохая' },
			],
		}),
		[
			{ id: 'g1', name: 'Первая', owner: null },
			{ id: 'g2', name: 'Вторая' },
		]
	)
})

test('usersEmptyText: поиск, учитель без учеников, остальные', () => {
	assert.equal(usersEmptyText({ searchQuery: 'ив', teacher: true, totalRows: 0 }), 'Пользователи не найдены')
	assert.equal(
		usersEmptyText({ searchQuery: '', teacher: true, totalRows: 0 }),
		'В ваших группах пока нет учеников. Пригласите ученика или добавьте его в группу.'
	)
	assert.equal(usersEmptyText({ searchQuery: '', teacher: true, totalRows: 3 }), 'Нет пользователей')
	assert.equal(usersEmptyText({ searchQuery: '', teacher: false, totalRows: 0 }), 'Нет пользователей')
})
