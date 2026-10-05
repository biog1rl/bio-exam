import assert from 'node:assert/strict'
import { test } from 'vitest'

import { assignmentErrorText, contactRows, studentRowSubtitle } from './student-card'

test('assignmentErrorText на 403 отдаёт текст об отсутствии прав, иначе исходное сообщение', () => {
	assert.equal(assignmentErrorText(403), 'Недостаточно прав для этого действия. Обратитесь к администратору.')
	assert.equal(
		assignmentErrorText(403, 'Forbidden'),
		'Недостаточно прав для этого действия. Обратитесь к администратору.'
	)
	assert.equal(assignmentErrorText(500, 'Ошибка удаления назначения'), 'Ошибка удаления назначения')
	assert.equal(assignmentErrorText(400, 'Ошибка назначения теста'), 'Ошибка назначения теста')
})

test('studentRowSubtitle помечает строки, которые нельзя снять, и прячет логин', () => {
	assert.equal(studentRowSubtitle({ canUnassign: false }), 'Не из ваших групп')
	assert.equal(studentRowSubtitle({ canUnassign: false, login: 'x', name: 'Анна' }), 'Не из ваших групп')
	assert.equal(studentRowSubtitle({ canUnassign: true, login: 'x', name: 'Анна' }), 'x')
	assert.equal(studentRowSubtitle({ canUnassign: true, login: 'x', name: null }), null)
	assert.equal(studentRowSubtitle({ canUnassign: true, name: 'Анна' }), null)
})

test('contactRows собирает четыре строки контактов с прочерком и ссылками', () => {
	assert.deepEqual(contactRows({ birthdate: '2010-05-03', telegram: null, phone: '+7900', email: 'a@b.c' }), [
		{ label: 'Дата рождения', value: '03.05.2010' },
		{ label: 'Telegram', value: '—' },
		{ label: 'Телефон', value: '+7900', href: 'tel:+7900' },
		{ label: 'Email', value: 'a@b.c', href: 'mailto:a@b.c' },
	])
})

test('contactRows без контактов отдаёт пустой список', () => {
	assert.deepEqual(contactRows({ birthdate: null, telegram: null, phone: null, email: null }), [])
	assert.deepEqual(contactRows({ birthdate: '', telegram: '  ', phone: '', email: '' }), [])
})

test('contactRows не сдвигает дату рождения и показывает прочерк для неразборчивой даты', () => {
	assert.equal(
		contactRows({ birthdate: '2010-01-01', telegram: '@anna', phone: null, email: null })[0].value,
		'01.01.2010'
	)
	assert.equal(contactRows({ birthdate: 'abc', telegram: '@anna', phone: null, email: null })[0].value, '—')
	assert.deepEqual(contactRows({ birthdate: null, telegram: '@anna', phone: null, email: null })[1], {
		label: 'Telegram',
		value: '@anna',
	})
})
