import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '../../db/index.js'
import { userGroups, users, userRoles } from '../../db/schema.js'
import { escapeLike } from '../../lib/sql-like.js'
import { studentOnlyFilter, type UserScope } from '../../services/access-policy/index.js'
import { avatarUrl } from '../../services/storage/links.js'
import type { UserRow } from '../../types/db/users.js'

export type UserRowScope = UserScope

export function userZoneFilter(scope: UserRowScope): SQL | undefined {
	return scope.all
		? undefined
		: and(
				sql`exists (select 1 from ${userGroups} where ${userGroups.userId} = ${users.id} and ${inArray(userGroups.groupId, scope.groupIds)})`,
				studentOnlyFilter(users.id)
			)
}

export async function selectUserRows(params: { where?: SQL; scope: UserRowScope; limit?: number; offset?: number }) {
	const { scope } = params
	const createdByUser = alias(users, 'createdByUser')
	const createdByName = scope.all
		? sql<string | null>`coalesce(${createdByUser.name}, ${createdByUser.login})`
		: sql<
				string | null
			>`coalesce(${createdByUser.name}, nullif(concat_ws(' ', ${createdByUser.firstName}, ${createdByUser.lastName}), ''))`
	const groupsInZone = scope.all ? sql`` : sql` and ${inArray(sql`ug.group_id`, scope.groupIds)}`

	let query = db
		.select({
			id: users.id,
			login: users.login,
			firstName: users.firstName,
			lastName: users.lastName,
			name: users.name,
			avatar: users.avatar,
			avatarCropped: users.avatarCropped,
			avatarColor: users.avatarColor,
			initials: users.initials,
			isActive: users.isActive,
			invitedAt: users.invitedAt,
			activatedAt: users.activatedAt,
			createdAt: users.createdAt,
			createdByName: createdByName.as('createdByName'),
			roles: sql<string[]>`
          coalesce(array_agg(${userRoles.roleKey}) filter (where ${userRoles.roleKey} is not null), '{}')
        `.as('roles'),
			birthdate: users.birthdate,
			telegram: users.telegram,
			phone: users.phone,
			email: users.email,
			groups: sql<Array<{ id: string; name: string }>>`
          coalesce((select json_agg(json_build_object('id', sg.id, 'name', sg.name) order by sg.name, sg.id)
           from user_groups ug
           inner join student_groups sg on sg.id = ug.group_id
           where ug.user_id = ${users.id}${groupsInZone}), '[]'::json)
        `.as('groups'),
		})
		.from(users)
		.leftJoin(userRoles, eq(userRoles.userId, users.id))
		.leftJoin(createdByUser, eq(users.createdBy, createdByUser.id))
		.where(and(params.where, userZoneFilter(scope)))
		.groupBy(
			users.id,
			users.login,
			users.firstName,
			users.lastName,
			users.name,
			users.avatar,
			users.avatarCropped,
			users.avatarColor,
			users.initials,
			users.isActive,
			users.invitedAt,
			users.activatedAt,
			users.createdAt,
			users.createdBy,
			users.birthdate,
			users.telegram,
			users.phone,
			users.email,
			createdByUser.name,
			createdByUser.login,
			createdByUser.firstName,
			createdByUser.lastName
		)
		.orderBy(desc(users.createdAt))
		.$dynamic()

	if (params.limit !== undefined) query = query.limit(params.limit)
	if (params.offset !== undefined) query = query.offset(params.offset)
	return query
}

export type RawUserRow = Awaited<ReturnType<typeof selectUserRows>>[number]

export function serializeUserRow(r: RawUserRow): UserRow {
	const groups = r.groups ?? []
	return {
		id: r.id,
		login: r.login,
		firstName: r.firstName,
		lastName: r.lastName,
		name: r.name,
		avatar: avatarUrl(r.avatar),
		avatarCropped: avatarUrl(r.avatarCropped),
		avatarColor: r.avatarColor,
		initials: r.initials,
		isActive: Boolean(r.isActive),
		invitedAt: r.invitedAt ? new Date(r.invitedAt).toISOString() : null,
		activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
		createdAt: new Date(r.createdAt).toISOString(),
		createdByName: r.createdByName,
		roles: r.roles ?? [],
		birthdate: r.birthdate,
		telegram: r.telegram,
		phone: r.phone,
		email: r.email,
		groups,
		groupName: groups[0]?.name ?? null,
	}
}

export const PEOPLE_QUERY_MIN = 2
export const PEOPLE_QUERY_TOO_SHORT = 'Укажите не меньше 2 символов для поиска'

export function peopleQuery(value: unknown): string | null {
	const q = typeof value === 'string' ? value.trim() : ''
	return q.length >= PEOPLE_QUERY_MIN ? q : null
}

export async function searchPeople(q: string, options: { limit: number; where?: SQL }) {
	const escaped = escapeLike(q)
	const contains = `%${escaped}%`
	const prefix = `${escaped}%`
	const fullName = sql`concat_ws(' ', ${users.firstName}, ${users.lastName})`
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			firstName: users.firstName,
			lastName: users.lastName,
			initials: users.initials,
			avatarColor: users.avatarColor,
			avatarCropped: users.avatarCropped,
		})
		.from(users)
		.where(
			and(
				eq(users.isActive, true),
				options.where,
				or(
					sql`${users.name} ilike ${contains} escape '\\'`,
					sql`${users.firstName} ilike ${contains} escape '\\'`,
					sql`${users.lastName} ilike ${contains} escape '\\'`,
					sql`${fullName} ilike ${contains} escape '\\'`
				)
			)
		)
		.orderBy(
			sql`case when lower(${users.name}) = lower(${q}) then 0 when ${users.name} ilike ${prefix} escape '\\' then 1 else 2 end`,
			asc(users.name),
			asc(users.id)
		)
		.limit(options.limit)
	return rows.map((row) => ({ ...row, avatarCropped: avatarUrl(row.avatarCropped) }))
}
