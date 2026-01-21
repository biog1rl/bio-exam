import { redirect } from 'next/navigation'

import { getServerMe } from '@/lib/auth/getServerMe'

import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
	const me = await getServerMe()
	if (!me) {
		redirect('/login')
	}

	return (
		<ProfileClient
			initialData={{
				firstName: me.firstName,
				lastName: me.lastName,
				login: me.login,
				avatar: me.avatar,
				avatarCropped: me.avatarCropped,
				avatarColor: me.avatarColor,
				initials: me.initials,
				avatarCropX: me.avatarCropX,
				avatarCropY: me.avatarCropY,
				avatarCropZoom: me.avatarCropZoom,
				avatarCropRotation: me.avatarCropRotation,
				avatarCropViewX: me.avatarCropViewX,
				avatarCropViewY: me.avatarCropViewY,
			}}
		/>
	)
}
