import Link from 'next/link'

import { cn } from '@/lib/utils/cn'

const LogoSidebar = ({ className }: { className?: string }) => {
	return (
		<Link href="/" className={cn('flex h-12 w-12 items-center justify-center rounded-full bg-yellow-200', className)}>
			<div className="relative h-8 w-8 overflow-hidden rounded-full bg-sidebar">
				<div className="absolute top-1 left-1 h-3 w-3 rounded-full bg-yellow-200"></div>
			</div>
		</Link>
	)
}

export default LogoSidebar
