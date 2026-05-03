import { BookOpen, CheckCircle2, Clock3, FileText, Layers3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { TopicStats } from './topic-page-utils'

function TopicStatTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
	return (
		<div className="border-border/70 bg-secondary/60 p-unit rounded-3xl border">
			<Icon className="text-primary mb-5 size-5" />
			<p className="font-serif text-3xl leading-none">{value}</p>
			<p className="text-muted-foreground mt-2 text-sm">{label}</p>
		</div>
	)
}

export function TopicStatsPanel({ stats }: { stats: TopicStats }) {
	return (
		<section className="tab-sm:grid-cols-2 tab:grid-cols-5 grid gap-3">
			<TopicStatTile label="тестов" value={stats.totalTests} icon={BookOpen} />
			<TopicStatTile label="опубликовано" value={stats.publishedTests} icon={CheckCircle2} />
			<TopicStatTile label="черновики" value={stats.draftTests} icon={FileText} />
			<TopicStatTile label="вопросов" value={stats.totalQuestions} icon={Layers3} />
			<TopicStatTile label="с таймером" value={stats.timedTests} icon={Clock3} />
		</section>
	)
}
