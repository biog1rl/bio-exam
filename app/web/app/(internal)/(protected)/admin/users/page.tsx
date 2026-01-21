import { Metadata } from 'next'

import UsersClient from './UsersClient'

export const metadata: Metadata = { title: 'Users — its-doc' }

export default function UsersPage() {
	return <UsersClient />
}
