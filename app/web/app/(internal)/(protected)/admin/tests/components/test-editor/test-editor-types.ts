import type { Dispatch, SetStateAction } from 'react'

import type { TestFormData } from '../../types'

export type TestFormSetter = Dispatch<SetStateAction<TestFormData>>

export type StudentAssignment = {
	userId: string
	assignedAt: string
	name: string | null
	login: string | null
}

export type UserItem = {
	id: string
	login: string | null
	name: string | null
	firstName: string | null
	lastName: string | null
}
