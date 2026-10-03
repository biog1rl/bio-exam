'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { MorphBlob } from '@/components/MorphBlob'
import { Button } from '@/components/ui/button'

export default function NotFound() {
	const router = useRouter()

	const handleBack = () => {
		if (window.history.length > 1) {
			router.back()
		} else {
			router.push('/')
		}
	}

	return (
		<div className="fixed top-0 left-0 flex h-screen w-full items-center justify-center bg-background">
			<div className="pointer-events-none absolute top-0 left-0 z-0 h-screen w-screen bg-[url('/img/noise.png')]" />

			<div className="flex flex-col items-center gap-y-4 text-center">
				<h1 className="animate-delay-1000 animate-[levitate_15s_ease_infinite] text-8xl font-bold">404-error</h1>
				<p className="animate-delay-700 animate-[levitate_15s_ease_infinite] text-3xl font-semibold uppercase">
					PAGE NOT FOUND
				</p>
				<p className="animate-delay-500 animate-[levitate_15s_ease_infinite] text-xl text-gray-600">
					Ну такой страницы нет вообще, либо кто-то что-то сломал
				</p>
				<Button onClick={handleBack} variant="outline" className="w-fit animate-[levitate_15s_ease_infinite]">
					Вернуться назад
				</Button>
			</div>

			<div className="pointer-events-none relative">
				<Image
					src="/img/not-found.png"
					alt="Not Found"
					width={300}
					height={300}
					className="animate-delay-1000 relative z-10 animate-[levitate_16s_ease_infinite]"
				/>

				<MorphBlob
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45"
					height={700}
					width={1000}
				/>
			</div>
		</div>
	)
}
