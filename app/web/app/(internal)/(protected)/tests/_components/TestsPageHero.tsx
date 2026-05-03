import { BookOpenCheck, Clock3, Layers3, LibraryBig } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { PublicTestsStats } from './tests-page-utils'

function StatChip({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
	return (
		<div className="border-border/70 bg-secondary/65 p-unit rounded-3xl border">
			<Icon className="text-primary mb-5 size-5" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
		</div>
	)
}

export function TestsPageHero({ stats }: { stats: PublicTestsStats }) {
	return (
		<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
			<div className="tab:grid-cols-[1fr_280px] grid gap-8">
				<div>
					<p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.22em]">практика</p>
					<h1 className="text-foreground tab-sm:text-5xl mt-2 max-w-3xl font-serif text-4xl leading-none">
						Каталог тестов
					</h1>
					<p className="text-muted-foreground mt-5 max-w-2xl text-base leading-7">
						Выберите тему, пройдите доступный тест и возвращайтесь к результатам, когда нужно закрепить материал.
					</p>
				</div>

				<div className="border-border/70 bg-secondary/55 p-unit rounded-3xl border">
					<BookOpenCheck className="text-primary size-7" />
					<p className="mt-6 font-serif text-4xl leading-none">{stats.totalTests}</p>
					<p className="text-muted-foreground mt-2 text-sm">доступных тестов</p>
				</div>
			</div>

			<div className="tab-sm:grid-cols-3 mt-8 grid gap-3">
				<StatChip label="темы" value={stats.totalTopics} icon={LibraryBig} />
				<StatChip label="вопросов" value={stats.totalQuestions} icon={Layers3} />
				<StatChip label="с таймером" value={stats.timedTests} icon={Clock3} />
			</div>
		</section>
	)
}
