import { Metadata } from 'next'

import UsersClient from './UsersClient'

export const metadata: Metadata = { title: 'Пользователи' }

export default function UsersPage() {
	return <UsersClient />
}
