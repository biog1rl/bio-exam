import NotificationOpenClient from './NotificationOpenClient'

export const metadata = { title: 'Уведомление' }

export default async function NotificationPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params

	return <NotificationOpenClient id={id} />
}
