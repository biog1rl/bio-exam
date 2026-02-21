import { getServerMe } from '@/lib/auth/getServerMe'

import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
	const me = await getServerMe()
	return (
		<ProfileClient
			initialData={{
				firstName: me?.firstName ?? null,
				lastName: me?.lastName ?? null,
				login: me?.login ?? null,
				avatar: me?.avatar ?? null,
				avatarCropped: me?.avatarCropped ?? null,
				avatarColor: me?.avatarColor ?? null,
				initials: me?.initials ?? null,
				avatarCropX: me?.avatarCropX ?? null,
				avatarCropY: me?.avatarCropY ?? null,
				avatarCropZoom: me?.avatarCropZoom ?? null,
				avatarCropRotation: me?.avatarCropRotation ?? null,
				avatarCropViewX: me?.avatarCropViewX ?? null,
				avatarCropViewY: me?.avatarCropViewY ?? null,
			}}
		/>
	)
}
