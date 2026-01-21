import 'dotenv/config'

import { ROLE_KEYS } from '@bio-exam/rbac'

import { db } from './index.js'
import { employees, projects, roles, workloadDayProjects as wdp } from './schema.js'

async function main() {
	// Инициализация ролей из RBAC пакета
	await db
		.insert(roles)
		.values(ROLE_KEYS.map((key) => ({ key })))
		.onConflictDoNothing()

	const p = await db
		.insert(projects)
		.values([
			{ key: 'ITS-DOC', name: 'ITS Documentation', visibility: 'private' },
			{ key: 'SITE', name: 'Company Site', visibility: 'private' },
		])
		.onConflictDoNothing()
		.returning({ id: projects.id })

	const e = await db
		.insert(employees)
		.values([{ displayName: 'Иван Петров' }, { displayName: 'Мария Смирнова' }])
		.onConflictDoNothing()
		.returning({ id: employees.id })

	const [p1, p2] = p
	const [e1, e2] = e
	const today = new Date().toISOString().slice(0, 10)

	if (p1 && p2 && e1 && e2) {
		await db
			.insert(wdp)
			.values([
				{ employeeId: e1.id, projectId: p1.id, dayDate: today },
				{ employeeId: e1.id, projectId: p2.id, dayDate: today },
				{ employeeId: e2.id, projectId: p2.id, dayDate: today },
			])
			.onConflictDoNothing({ target: [wdp.employeeId, wdp.projectId, wdp.dayDate] })
	}

	console.log('Seed OK')
}
main().catch((e) => {
	console.error(e)
	process.exit(1)
})
