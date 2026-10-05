import { EyeOff, FolderPlus, Library } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils/cn'

import type { Topic } from '../../types'

const ALL_VALUE = '__all__'

export type BankTopicLink = { slug: string | null; title: string; count: number; hidden: boolean; href: string }

export function bankTopicLinks(
	topics: readonly Topic[],
	totalTests: number,
	countOf: (topic: Topic) => number,
	hrefOf: (slug: string | null) => string
): BankTopicLink[] {
	return [
		{ slug: null, title: 'Все тесты', count: totalTests, hidden: false, href: hrefOf(null) },
		...topics.map((topic) => ({
			slug: topic.slug,
			title: topic.title,
			count: countOf(topic),
			hidden: !topic.isActive,
			href: hrefOf(topic.slug),
		})),
	]
}

interface BankTopicsNavProps {
	links: BankTopicLink[]
	currentSlug: string | null
	canCreateTopic: boolean
	onCreateTopic: () => void
}

export function BankTopicsNav({ links, currentSlug, canCreateTopic, onCreateTopic }: BankTopicsNavProps) {
	return (
		<nav
			aria-label="Темы банка"
			className="rounded-4xl border border-border/80 bg-card/90 p-2 shadow-sm tab:sticky tab:top-unit tab:max-h-[calc(100dvh-8rem)] tab:overflow-y-auto"
		>
			<div className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
				<h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">Темы</h2>
				{canCreateTopic ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="size-8 rounded-full"
								onClick={onCreateTopic}
								aria-label="Создать тему"
							>
								<FolderPlus className="size-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Создать тему</TooltipContent>
					</Tooltip>
				) : null}
			</div>
			<ul className="mt-1 space-y-0.5">
				{links.map((link) => {
					const current = link.slug === currentSlug
					return (
						<li key={link.slug ?? ALL_VALUE}>
							<Link
								href={link.href}
								aria-current={current ? 'page' : undefined}
								className={cn(
									'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
									current ? 'bg-secondary font-medium text-foreground' : 'text-foreground/85'
								)}
							>
								{link.slug === null ? <Library className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
								<span className="min-w-0 flex-1 truncate">{link.title}</span>
								{link.hidden ? (
									<span title="Скрыта из каталога" className="shrink-0 text-muted-foreground">
										<EyeOff className="size-3.5" aria-hidden="true" />
										<span className="sr-only">Скрыта из каталога.</span>
									</span>
								) : null}
								<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{link.count}</span>
							</Link>
						</li>
					)
				})}
			</ul>
		</nav>
	)
}

export function BankTopicSelect({ links, currentSlug }: { links: BankTopicLink[]; currentSlug: string | null }) {
	const router = useRouter()
	return (
		<Select
			value={currentSlug ?? ALL_VALUE}
			onValueChange={(value) => {
				const link = links.find((item) => (item.slug ?? ALL_VALUE) === value)
				if (link) router.push(link.href)
			}}
		>
			<SelectTrigger className="h-10 w-full rounded-full bg-card" aria-label="Тема">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{links.map((link) => (
					<SelectItem key={link.slug ?? ALL_VALUE} value={link.slug ?? ALL_VALUE}>
						{link.title} · {link.count}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
