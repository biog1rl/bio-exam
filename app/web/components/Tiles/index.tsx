import { FC } from 'react'

import { ArrowRightIcon } from 'lucide-react'
import { Route } from 'next'
import Link from 'next/link'

import { Button } from '../ui/button'

export type TilesItem = {
	href: string
	name: string
}

type TilesProps = {
	items: Array<TilesItem>
}

const Tiles: FC<TilesProps> = ({ items }) => {
	return (
		<>
			{items.map((item, index) => (
				<Button asChild key={index} className="bg-background text-primary w-fit hover:text-white" variant="default">
					<Link href={item.href as Route}>
						<ArrowRightIcon className="mr-2 h-4 w-4" />
						<span>{item.name}</span>
					</Link>
				</Button>
			))}
		</>
	)
}

export default Tiles
