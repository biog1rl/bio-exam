import { BarChart3, ClipboardList, FlaskConical, LockKeyhole, Settings2, ShieldCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'

const adminSections = [
	{
		href: '/admin/tests',
		kicker: 'банк заданий',
		title: 'Тесты',
		description: 'Темы, тесты, вопросы и правила оценивания.',
		meta: 'контент и оценивание',
		icon: FlaskConical,
	},
	{
		href: '/admin/users',
		kicker: 'доступы',
		title: 'Пользователи',
		description: 'Аккаунты студентов, преподавателей и администраторов.',
		meta: 'роли и профили',
		icon: UsersRound,
	},
	{
		href: '/admin/groups',
		kicker: 'когорты',
		title: 'Группы',
		description: 'Учебные группы и состав участников.',
		meta: 'назначения',
		icon: ShieldCheck,
	},
	{
		href: '/admin/settings',
		kicker: 'система',
		title: 'Настройки',
		description: 'RBAC, графики и параметры внутренних разделов.',
		meta: 'конфигурация',
		icon: Settings2,
	},
	{
		href: '/admin/attempts',
		kicker: 'результаты',
		title: 'Попытки',
		description: 'Журнал прохождений, баллы и переходы к разбору ответов.',
		meta: 'контроль результатов',
		icon: ClipboardList,
	},
]

const settingsLinks = [
	{ href: '/admin/settings/rbac', label: 'RBAC', icon: LockKeyhole },
	{ href: '/admin/settings/chart', label: 'График', icon: BarChart3 },
	{ href: '/admin/sidebar', label: 'Сайдбар', icon: Settings2 },
]

export default function AdminPage() {
	return (
		<main className="space-y-unit">
			<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
				<div className="gap-unit tab:flex-row tab:items-end tab:justify-between flex flex-col">
					<div className="max-w-3xl">
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">
							admin console
						</p>
						<h1 className="text-foreground tab-sm:text-5xl mt-2 font-serif text-4xl leading-none">Панель управления</h1>
						<p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
							Разделы администрирования собраны в одном рабочем контуре: контент экзамена, пользователи, группы и
							системные настройки.
						</p>
					</div>

					<div className="border-border/70 bg-secondary/55 rounded-3xl border p-4">
						<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">статус</p>
						<p className="mt-2 font-serif text-2xl leading-none">5 активных разделов</p>
						<p className="text-muted-foreground mt-2 text-sm">Попытки доступны отдельным журналом.</p>
					</div>
				</div>
			</section>

			<section className="tab-sm:grid-cols-2 tab:grid-cols-3 grid gap-4">
				{adminSections.map((section) => (
					<AdminSectionCard key={section.href} {...section} />
				))}
			</section>

			<section className="tab:grid-cols-[1.5fr_1fr] grid gap-4">
				<div className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border">
					<div className="tab-sm:flex-row tab-sm:items-center tab-sm:justify-between flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">
								быстрые настройки
							</p>
							<h2 className="mt-2 font-serif text-3xl leading-none">Служебные экраны</h2>
						</div>
						<p className="text-muted-foreground max-w-md text-sm leading-6">
							Прямые входы в вложенные настройки, которые уже представлены отдельными маршрутами.
						</p>
					</div>

					<div className="mt-unit tab-sm:grid-cols-3 grid gap-3">
						{settingsLinks.map(({ href, label, icon: Icon }) => (
							<Link
								key={href}
								href={href}
								className="border-border/70 bg-secondary/45 hover:border-primary/45 hover:bg-secondary/75 hover:text-primary focus-visible:border-primary focus-visible:bg-secondary/75 group rounded-3xl border px-4 py-4 transition-colors focus-visible:outline-none"
							>
								<Icon
									className="text-muted-foreground group-hover:text-primary size-5 transition-colors"
									aria-hidden="true"
								/>
								<span className="mt-4 block font-serif text-2xl leading-none">{label}</span>
							</Link>
						))}
					</div>
				</div>

				<Link
					href="/admin/attempts"
					className="rounded-4xl border-border/80 bg-secondary/35 p-unit-mob hover:border-primary/45 hover:bg-secondary/65 hover:text-primary focus-visible:border-primary tab-sm:p-unit group border transition-colors focus-visible:outline-none"
				>
					<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">результаты</p>
					<h2 className="mt-2 font-serif text-3xl leading-none">Попытки</h2>
					<p className="text-muted-foreground mt-4 text-sm leading-6">
						Быстрый переход к журналу последних прохождений и детальным разборам ответов.
					</p>
				</Link>
			</section>
		</main>
	)
}

function AdminSectionCard({ href, kicker, title, description, meta, icon: Icon }: (typeof adminSections)[number]) {
	return (
		<Link
			href={href}
			className="rounded-4xl border-border/80 bg-card/90 p-unit-mob hover:border-primary/45 hover:bg-secondary/55 hover:text-primary focus-visible:border-primary focus-visible:bg-secondary/55 tab-sm:p-unit group flex min-h-56 flex-col justify-between border transition-colors focus-visible:outline-none"
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">{kicker}</p>
					<h2 className="text-foreground group-hover:text-primary mt-3 font-serif text-3xl leading-none transition-colors">
						{title}
					</h2>
				</div>
				<div className="border-border/70 bg-secondary/55 group-hover:border-primary/35 group-hover:bg-card rounded-3xl border p-3 transition-colors">
					<Icon
						className="text-muted-foreground group-hover:text-primary size-6 transition-colors"
						aria-hidden="true"
					/>
				</div>
			</div>

			<div className="mt-unit">
				<p className="text-muted-foreground max-w-xl text-base leading-7">{description}</p>
				<p className="text-muted-foreground mt-5 font-mono text-[0.6875rem] uppercase tracking-[0.18em]">{meta}</p>
			</div>
		</Link>
	)
}
