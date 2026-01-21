import { db } from '../db/index.js'
import { sidebarItems } from '../db/schema.js'

const initialSidebarItems = [
	{
		title: 'Нагрузка',
		url: '/workload',
		icon: 'TableIcon',
		target: '_self' as const,
		order: 0,
	},
	{
		title: 'Проекты',
		url: '/projects',
		icon: 'BookCopyIcon',
		target: '_self' as const,
		order: 1,
	},
	{
		title: 'Документация',
		url: '/docs',
		icon: 'FileIcon',
		target: '_self' as const,
		order: 2,
	},
	{
		title: 'Команда',
		url: '/team',
		icon: 'UsersIcon',
		target: '_self' as const,
		order: 3,
	},
	{
		title: 'Админка',
		url: '/admin',
		icon: 'ShieldCheckIcon',
		target: '_self' as const,
		order: 4,
	},
	{
		title: 'Дашборд',
		url: '/dashboard',
		icon: 'LayoutDashboardIcon',
		target: '_self' as const,
		order: 5,
	},
]

async function seed() {
	console.log('🌱 Seeding sidebar items...')

	const existing = await db.select().from(sidebarItems)

	if (existing.length > 0) {
		console.log(`✓ Sidebar already has ${existing.length} items, skipping seed`)
		return
	}

	await db.insert(sidebarItems).values(initialSidebarItems)

	console.log(`✓ Created ${initialSidebarItems.length} sidebar items`)
	console.log('✅ Sidebar seed completed!')
}

seed()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('❌ Seed failed:', err)
		process.exit(1)
	})
