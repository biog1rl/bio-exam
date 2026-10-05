import { BookOpenCheck, Clock3, Layers3, LibraryBig } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { PublicTestsStats } from './tests-page-utils'

function StatChip({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
	return (
		<div className="rounded-3xl border border-border/70 bg-secondary/65 p-unit">
			<Icon className="mb-5 size-5 text-primary" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="mt-2 text-sm text-muted-foreground">{label}</p>
		</div>
	)
}

export function TestsPageHero({ stats }: { stats: PublicTestsStats }) {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
			<div className="grid gap-6 tab:grid-cols-[1fr_17.5rem] tab:gap-8">
				<div>
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">практика</p>
					<h1 className="mt-2 max-w-3xl font-serif text-3xl leading-none text-foreground mob:text-4xl tab-sm:text-5xl">
						Тесты
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
						Выберите тему, пройдите доступный тест и возвращайтесь к результатам, когда нужно закрепить материал.
					</p>
				</div>

				<div className="rounded-3xl border border-border/70 bg-secondary/55 p-unit">
					<BookOpenCheck className="size-7 text-primary" />
					<p className="mt-6 font-serif text-4xl leading-none">{stats.totalTests}</p>
					<p className="mt-2 text-sm text-muted-foreground">доступных тестов</p>
				</div>
			</div>

			<div className="mt-8 grid gap-3 mob:grid-cols-2 tab-sm:grid-cols-3">
				<StatChip label="темы" value={stats.totalTopics} icon={LibraryBig} />
				<StatChip label="вопросов" value={stats.totalQuestions} icon={Layers3} />
				<StatChip label="с таймером" value={stats.timedTests} icon={Clock3} />
			</div>
		</section>
	)
}
