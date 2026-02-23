import Image from 'next/image'
import { redirect } from 'next/navigation'

export default function Home() {
	redirect('/dashboard')

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<Image
				src="/img/main-bg.webp"
				alt="main-bg"
				width={1920}
				height={1080}
				className="pointer-events-none absolute left-0 top-0 h-full w-full object-cover blur"
				quality={100}
				priority
				unoptimized
			/>
			<div className="space-y-6 lg:col-span-2">
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2"></div>
			</div>

			<div className="space-y-6"></div>
		</div>
	)
}
