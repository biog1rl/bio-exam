'use client'

import { MeshGradient } from '@paper-design/shaders-react'

import { useEffect, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

const words = ['bio', 'exam', 'soon']

export default function Home() {
	const [currentIndex, setCurrentIndex] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % words.length)
		}, 2000)

		return () => clearInterval(interval)
	}, [])

	return (
		<div className="relative h-screen w-full overflow-hidden bg-black">
			<MeshGradient
				className="absolute inset-0 h-full w-full"
				colors={['#000000', '#1a1a1a', '#333', '#ddd']}
				speed={1.0}
			/>

			<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
				<LayoutGroup>
					<div className="flex items-center text-7xl font-bold text-neutral-50/90 will-change-transform">
						<motion.span
							layout
							transition={{
								layout: { duration: 0.7, ease: [0.4, 0, 0.2, 1] },
							}}
						>
							its.
						</motion.span>
						<AnimatePresence mode="popLayout">
							<motion.span
								key={words[currentIndex]}
								layout
								initial={{ opacity: 0, filter: 'blur(10px)' }}
								animate={{ opacity: 1, filter: 'blur(0px)' }}
								exit={{ opacity: 0, filter: 'blur(10px)' }}
								transition={{
									duration: 0.8,
									ease: [0.4, 0, 0.2, 1],
								}}
								style={{ display: 'inline-block' }}
							>
								{words[currentIndex]}
							</motion.span>
						</AnimatePresence>
					</div>
				</LayoutGroup>
			</div>
		</div>
	)
}
