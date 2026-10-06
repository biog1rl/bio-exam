import { expect, it } from 'vitest'

import { personName } from './person-name'

it.each([
	[
		'имя и фамилия важнее name',
		{ firstName: 'Анна', lastName: 'Иванова', name: 'Анна И.', login: 'anna' },
		'Анна Иванова',
	],
	['только имя', { firstName: 'Анна', lastName: null, name: null }, 'Анна'],
	['без имени и фамилии — name', { firstName: ' ', lastName: null, name: 'Пётр', login: 'petr' }, 'Пётр'],
	['без name — логин', { firstName: null, lastName: null, name: '  ', login: 'boris' }, 'boris'],
	['ничего нет — прочерк', { firstName: null, lastName: null, name: null, login: null }, '—'],
])('%s', (_case, person, expected) => {
	expect(personName(person)).toBe(expected)
})

it('свой запасной текст, когда нет ни имени, ни логина', () => {
	expect(personName({ name: null }, 'u-1')).toBe('u-1')
})
