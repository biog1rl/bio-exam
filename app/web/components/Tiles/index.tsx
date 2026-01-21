import { FC } from 'react'

import { Route } from 'next'
import Link from 'next/link'

import { cn } from '@/lib/utils'

type TilesProps = {
	items: Array<{
		name: string
		href: string
	}>
}

const Tiles: FC<TilesProps> = ({ items }) => {
	return (
		<div className="gap-unit-mob tab:gap-unit grid h-full [grid-template-columns:repeat(auto-fill,minmax(0,400px))] [grid-template-rows:repeat(auto-fill,minmax(0,200px))]">
			{items.map((item, index) => (
				<Link
					href={item.href as Route}
					key={index}
					className={cn(
						'group flex items-center justify-center',
						'rounded-lg border backdrop-blur-md transition-colors hover:border-black dark:hover:border-white'
					)}
				>
					<span className="text-[100px] font-bold text-black transition-transform group-hover:scale-110 dark:text-white">
						{item.name}
					</span>
				</Link>
			))}
		</div>
	)
}

export default Tiles
