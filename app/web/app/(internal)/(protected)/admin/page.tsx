import type { PermissionKey } from '@bio-exam/rbac'

import {
	BarChart3,
	ClipboardList,
	FlaskConical,
	LockKeyhole,
	Settings2,
	ShieldCheck,
	UsersRound,
	type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import {
	adminHeroText,
	sectionsCountLabel,
	visibleAdminCards,
	visibleServiceLinks,
	type AdminCard,
	type AdminCardKey,
	type ServiceLinkKey,
} from '@/lib/admin/sections'
import { canAccessSection } from '@/lib/session/route-permissions'
import { getServerMe } from '@/lib/session/server'

const CARD_ICONS: Record<AdminCardKey, LucideIcon> = {
	tests: FlaskConical,
	users: UsersRound,
	groups: ShieldCheck,
	settings: Settings2,
	attempts: ClipboardList,
}

const SERVICE_LINK_ICONS: Record<ServiceLinkKey, LucideIcon> = {
	rbac: LockKeyhole,
	chart: BarChart3,
	sidebar: Settings2,
}

export default async function AdminPage() {
	const me = await getServerMe()
	if (!me) return null

	const perms = new Set<PermissionKey>(me.perms)
	const cards = visibleAdminCards(perms)
	const serviceLinks = visibleServiceLinks(perms)
	const showAttemptsLink = canAccessSection(perms, 'attempts')

	return (
		<main className="space-y-unit">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<div className="flex flex-col gap-unit tab:flex-row tab:items-end tab:justify-between">
					<div className="max-w-3xl">
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
							admin console
						</p>
						<h1 className="mt-2 font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">Панель управления</h1>
						<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{adminHeroText(perms)}</p>
					</div>

					<div className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">статус</p>
						<p className="mt-2 font-serif text-2xl leading-none">{sectionsCountLabel(cards.length)}</p>
						<p className="mt-2 text-sm text-muted-foreground">Попытки доступны отдельным журналом.</p>
					</div>
				</div>
			</section>

			<section className="grid gap-4 tab-sm:grid-cols-2 tab:grid-cols-3">
				{cards.map((card) => (
					<AdminSectionCard key={card.href} card={card} />
				))}
			</section>

			{serviceLinks.length > 0 || showAttemptsLink ? (
				<section
					className={
						serviceLinks.length > 0 && showAttemptsLink ? 'grid gap-4 tab:grid-cols-[1.5fr_1fr]' : 'grid gap-4'
					}
				>
					{serviceLinks.length > 0 ? (
						<div className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
							<div className="flex flex-col gap-4 tab-sm:flex-row tab-sm:items-center tab-sm:justify-between">
								<div>
									<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
										быстрые настройки
									</p>
									<h2 className="mt-2 font-serif text-3xl leading-none">Служебные экраны</h2>
								</div>
								<p className="max-w-md text-sm leading-6 text-muted-foreground">
									Прямые входы в вложенные настройки, которые уже представлены отдельными маршрутами.
								</p>
							</div>

							<div className="mt-unit grid gap-3 tab-sm:grid-cols-3">
								{serviceLinks.map(({ key, href, label }) => {
									const Icon = SERVICE_LINK_ICONS[key]
									return (
										<Link
											key={href}
											href={href}
											className="group rounded-3xl border border-border/70 bg-secondary/45 px-4 py-4 transition-colors hover:border-primary/45 hover:bg-secondary/75 hover:text-primary focus-visible:border-primary focus-visible:bg-secondary/75 focus-visible:outline-none"
										>
											<Icon
												className="size-5 text-muted-foreground transition-colors group-hover:text-primary"
												aria-hidden="true"
											/>
											<span className="mt-4 block font-serif text-2xl leading-none">{label}</span>
										</Link>
									)
								})}
							</div>
						</div>
					) : null}

					{showAttemptsLink ? (
						<Link
							href="/admin/attempts"
							className="group rounded-4xl border border-border/80 bg-secondary/35 p-unit-mob transition-colors hover:border-primary/45 hover:bg-secondary/65 hover:text-primary focus-visible:border-primary focus-visible:outline-none tab-sm:p-unit"
						>
							<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">результаты</p>
							<h2 className="mt-2 font-serif text-3xl leading-none">Попытки</h2>
							<p className="mt-4 text-sm leading-6 text-muted-foreground">
								Быстрый переход к журналу последних прохождений и детальным разборам ответов.
							</p>
						</Link>
					) : null}
				</section>
			) : null}
		</main>
	)
}

function AdminSectionCard({ card }: { card: AdminCard }) {
	const { href, kicker, title, description, meta } = card
	const Icon = CARD_ICONS[card.key]
	return (
		<Link
			href={href}
			className="group flex min-h-56 flex-col justify-between rounded-4xl border border-border/80 bg-card/90 p-unit-mob transition-colors hover:border-primary/45 hover:bg-secondary/55 hover:text-primary focus-visible:border-primary focus-visible:bg-secondary/55 focus-visible:outline-none tab-sm:p-unit"
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{kicker}</p>
					<h2 className="mt-3 font-serif text-3xl leading-none text-foreground transition-colors group-hover:text-primary">
						{title}
					</h2>
				</div>
				<div className="rounded-3xl border border-border/70 bg-secondary/55 p-3 transition-colors group-hover:border-primary/35 group-hover:bg-card">
					<Icon
						className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
						aria-hidden="true"
					/>
				</div>
			</div>

			<div className="mt-unit">
				<p className="max-w-xl text-base leading-7 text-muted-foreground">{description}</p>
				<p className="mt-5 font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">{meta}</p>
			</div>
		</Link>
	)
}
