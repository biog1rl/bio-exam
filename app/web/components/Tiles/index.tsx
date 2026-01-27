import { FC } from 'react'

import { ArrowRightIcon } from 'lucide-react'
import { Route } from 'next'
import Link from 'next/link'

import { Button } from '../ui/button'

type TilesProps = {
	items: Array<{
		name: string
		href: string
	}>
}

const Tiles: FC<TilesProps> = ({ items }) => {
	return (
		<>
			{items.map((item, index) => (
				<Button asChild key={index} className="text-primary w-fit bg-white hover:text-white" variant="default">
					<div>
						<ArrowRightIcon className="mr-2 h-4 w-4" />
						<Link href={item.href as Route}>{item.name}</Link>
					</div>
				</Button>
			))}
		</>
	)
}

export default Tiles
