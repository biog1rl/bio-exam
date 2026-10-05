import { STAFF_ROLE_KEYS, type PermissionKey } from '@bio-exam/rbac'

import { pgPool } from '../../db/index.js'
import { transliterate } from '../../lib/transliterate.js'
import { studentOnlySql, type GroupScope, type TestScope, type UserScope } from '../access-policy/index.js'
import { mapBounded } from '../question-content/index.js'
import { attemptResultSql } from '../scored-attempt/columns.js'
import { highlightSnippet } from './highlight.js'

export const SEARCH_DB_CONCURRENCY = 2

export type SearchScope = 'all' | 'tests' | 'questions' | 'users' | 'groups' | 'attempts'
export type SearchResultType = 'topic' | 'test' | 'question' | 'user' | 'group' | 'attempt'

export type SearchResultItem = {
	type: SearchResultType
	id: string
	title: string
	subtitle: string
	snippetHtml: string
	href: string
	score: number
}

export type SearchCategory = {
	scope: Exclude<SearchScope, 'all'>
	title: string
	available: boolean
	items: SearchResultItem[]
}

export type SearchResponse = {
	query: string
	categories: SearchCategory[]
	total: number
}

type SearchAccess = {
	userId: string
	permissions: ReadonlySet<PermissionKey>
	tests: TestScope
	groups: GroupScope
	users: UserScope
}

type RawSearchRow = {
	type: SearchResultType
	id: string
	title: string | null
	subtitle: string | null
	snippet_source: string | null
	href: string
	score: number | string | null
}

export type SearchExecutor = (sqlText: string, values: unknown[]) => Promise<{ rows: RawSearchRow[] }>

type SearchParams = {
	query: string
	scope: SearchScope
	limit: number
	access: SearchAccess
	executor?: SearchExecutor
}

const defaultExecutor: SearchExecutor = (sqlText, values) => pgPool.query<RawSearchRow>(sqlText, values)

const CATEGORY_TITLES: Record<Exclude<SearchScope, 'all'>, string> = {
	tests: 'Тесты',
	questions: 'Вопросы',
	users: 'Пользователи',
	groups: 'Группы',
	attempts: 'Попытки',
}

function normalizeQuery(query: string): string {
	return query.replace(/\s+/g, ' ').trim()
}

function clampLimit(value: number): number {
	if (!Number.isFinite(value)) return 10
	return Math.max(1, Math.min(Math.trunc(value), 25))
}

export function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function queryAlt(query: string): string {
	const alt = transliterate(query).trim()
	return alt && alt.toLowerCase() !== query.toLowerCase() ? alt : query
}

function hasTestZone(tests: TestScope): boolean {
	return tests.all || tests.topicIds.length > 0
}

function canRunScope(scope: Exclude<SearchScope, 'all'>, access: SearchAccess): boolean {
	if (scope === 'tests') return true
	if (scope === 'questions') return access.permissions.has('tests.write') && hasTestZone(access.tests)
	if (scope === 'users') return access.permissions.has('users.read')
	if (scope === 'groups') return access.permissions.has('groups.manage_groups')
	if (scope === 'attempts') return true
	return false
}

function toResult(row: RawSearchRow, query: string): SearchResultItem {
	const snippetSource = row.snippet_source || row.subtitle || row.title || ''
	return {
		type: row.type,
		id: row.id,
		title: row.title || 'Без названия',
		subtitle: row.subtitle || '',
		snippetHtml: highlightSnippet(snippetSource, query),
		href: row.href,
		score: Number(row.score ?? 0),
	}
}

async function queryRows(
	executor: SearchExecutor,
	sqlText: string,
	values: unknown[],
	query: string
): Promise<SearchResultItem[]> {
	const result = await executor(sqlText, values)
	return result.rows.map((row) => toResult(row, query))
}

async function searchTests(params: {
	query: string
	like: string
	limit: number
	access: SearchAccess
	executor: SearchExecutor
}) {
	const tests = params.access.tests
	if (hasTestZone(tests)) {
		const values: unknown[] = [params.query, params.like, params.limit]
		let topicZone = ''
		let testZone = ''
		if (!tests.all) {
			values.push(tests.topicIds)
			topicZone = `and t.id = any($${values.length}::uuid[])`
			testZone = `and te.topic_id = any($${values.length}::uuid[])`
		}
		return queryRows(
			params.executor,
			`
				select *
				from (
					select
						'topic'::text as type,
						t.id::text as id,
						t.title,
						coalesce(t.description, t.slug) as subtitle,
						concat_ws(' ', t.title, t.description, t.slug) as snippet_source,
						('/admin/tests/' || t.slug) as href,
						greatest(
							extensions.similarity(coalesce(t.title, ''), $1),
							extensions.similarity(coalesce(t.description, ''), $1),
							extensions.similarity(coalesce(t.slug, ''), $1),
							case when concat_ws(' ', t.title, t.description, t.slug) ilike $2 escape '\\' then 1 else 0 end
						) as score
					from topics t
					where (
						concat_ws(' ', t.title, t.description, t.slug) ilike $2 escape '\\'
						or extensions.similarity(concat_ws(' ', t.title, t.description, t.slug), $1) > 0.08
					)
					${topicZone}

					union all

					select
						'test'::text as type,
						te.id::text as id,
						te.title,
						concat_ws(' · ', top.title, te.description, te.slug) as subtitle,
						concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) as snippet_source,
						('/admin/tests/' || top.slug || '/' || te.slug) as href,
						greatest(
							extensions.similarity(coalesce(te.title, ''), $1),
							extensions.similarity(coalesce(te.description, ''), $1),
							extensions.similarity(coalesce(te.slug, ''), $1),
							extensions.similarity(coalesce(top.title, ''), $1),
							case when concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) ilike $2 escape '\\' then 1 else 0 end
						) as score
					from tests te
					inner join topics top on top.id = te.topic_id
					where (
						concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) ilike $2 escape '\\'
						or extensions.similarity(concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug), $1) > 0.08
					)
					${testZone}
				) rows
				order by score desc, title asc
				limit $3
			`,
			values,
			params.query
		)
	}

	return queryRows(
		params.executor,
		`
			select
				'test'::text as type,
				te.id::text as id,
				te.title,
				concat_ws(' · ', top.title, te.description, te.slug) as subtitle,
				concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) as snippet_source,
				('/tests/' || top.slug || '/' || te.slug) as href,
				greatest(
					extensions.similarity(coalesce(te.title, ''), $1),
					extensions.similarity(coalesce(te.description, ''), $1),
					extensions.similarity(coalesce(te.slug, ''), $1),
					extensions.similarity(coalesce(top.title, ''), $1),
					case when concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) ilike $2 escape '\\' then 1 else 0 end
				) as score
			from tests te
			inner join topics top on top.id = te.topic_id
			inner join test_assignments ta on ta.test_id = te.id and ta.user_id = $3
			where te.is_published = true
				and top.is_active = true
				and (
					concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug) ilike $2 escape '\\'
					or extensions.similarity(concat_ws(' ', te.title, te.description, te.slug, top.title, top.slug), $1) > 0.08
				)
			order by score desc, te.title asc
			limit $4
		`,
		[params.query, params.like, params.access.userId, params.limit],
		params.query
	)
}

async function searchQuestions(params: {
	query: string
	like: string
	limit: number
	tests: TestScope
	executor: SearchExecutor
}) {
	const values: unknown[] = [params.query, params.like, params.limit]
	let zone = ''
	if (!params.tests.all) {
		values.push(params.tests.topicIds)
		zone = `and qsd.topic_id = any($${values.length}::uuid[])`
	}

	return queryRows(
		params.executor,
		`
			select
				'question'::text as type,
				qsd.question_id::text as id,
				('Вопрос #' || q.order::text) as title,
				concat_ws(' · ', top.title, te.title, q.type) as subtitle,
				concat_ws(' ', qsd.prompt_text, qsd.options_text, qsd.matching_text) as snippet_source,
				('/admin/tests/' || top.slug || '/' || te.slug || '/questions/' || qsd.question_id::text) as href,
				greatest(
					extensions.similarity(coalesce(qsd.search_text, ''), $1),
					extensions.similarity(coalesce(q.type, ''), $1),
					extensions.similarity('Вопрос #' || q.order::text, $1),
					case when concat_ws(' ', qsd.search_text, q.type, 'Вопрос #' || q.order::text) ilike $2 escape '\\' then 1 else 0 end
				) as score
			from question_search_documents qsd
			inner join questions q on q.id = qsd.question_id
			inner join tests te on te.id = qsd.test_id
			inner join topics top on top.id = qsd.topic_id
			where (
				concat_ws(' ', qsd.search_text, q.type, 'Вопрос #' || q.order::text) ilike $2 escape '\\'
				or extensions.similarity(concat_ws(' ', qsd.search_text, q.type, 'Вопрос #' || q.order::text), $1) > 0.08
			)
			${zone}
			order by score desc, top.title asc, te.title asc, q.order asc
			limit $3
		`,
		values,
		params.query
	)
}

async function searchUsers(params: {
	query: string
	like: string
	limit: number
	users: UserScope
	executor: SearchExecutor
}) {
	const values: unknown[] = [params.query, params.like, params.limit]
	let zone = ''
	if (!params.users.all) {
		values.push(params.users.groupIds)
		zone = `and exists (select 1 from user_groups ug where ug.user_id = u.id and ug.group_id = any($${values.length}::uuid[]))`
		zone += ` and ${studentOnlySql('u.id', values)}`
	}

	return queryRows(
		params.executor,
		`
			select
				'user'::text as type,
				u.id::text as id,
				coalesce(u.name, concat_ws(' ', u.first_name, u.last_name), u.login, 'Пользователь') as title,
				concat_ws(' · ', u.login, u.email, u.telegram, u.phone) as subtitle,
				concat_ws(' ', u.name, u.first_name, u.last_name, u.login, u.email, u.telegram, u.phone) as snippet_source,
				('/admin/users/' || u.id::text) as href,
				greatest(
					extensions.similarity(coalesce(u.name, ''), $1),
					extensions.similarity(coalesce(u.login, ''), $1),
					extensions.similarity(coalesce(u.email, ''), $1),
					case when concat_ws(' ', u.name, u.first_name, u.last_name, u.login, u.email, u.telegram, u.phone) ilike $2 escape '\\' then 1 else 0 end
				) as score
			from users u
			where (
				concat_ws(' ', u.name, u.first_name, u.last_name, u.login, u.email, u.telegram, u.phone) ilike $2 escape '\\'
				or extensions.similarity(concat_ws(' ', u.name, u.first_name, u.last_name, u.login, u.email, u.telegram, u.phone), $1) > 0.08
			)
			${zone}
			order by score desc, title asc
			limit $3
		`,
		values,
		params.query
	)
}

async function searchGroups(params: {
	query: string
	like: string
	limit: number
	groups: GroupScope
	executor: SearchExecutor
}) {
	const values: unknown[] = [params.query, params.like, params.limit]
	let zone = ''
	if (!params.groups.all) {
		values.push(params.groups.groupIds)
		zone = `where sg.id = any($${values.length}::uuid[])`
	}

	return queryRows(
		params.executor,
		`
			select
				'group'::text as type,
				sg.id::text as id,
				sg.name as title,
				(count(ug.user_id)::text || ' участников') as subtitle,
				concat_ws(' ', sg.name, string_agg(coalesce(u.name, u.login, ''), ' ')) as snippet_source,
				'/admin/groups' as href,
				greatest(
					extensions.similarity(coalesce(sg.name, ''), $1),
					extensions.similarity(coalesce(string_agg(coalesce(u.name, u.login, ''), ' '), ''), $1),
					case when concat_ws(' ', sg.name, string_agg(coalesce(u.name, u.login, ''), ' ')) ilike $2 escape '\\' then 1 else 0 end
				) as score
			from student_groups sg
			left join user_groups ug on ug.group_id = sg.id
			left join users u on u.id = ug.user_id
			${zone}
			group by sg.id, sg.name
			having concat_ws(' ', sg.name, string_agg(coalesce(u.name, u.login, ''), ' ')) ilike $2 escape '\\'
				or extensions.similarity(concat_ws(' ', sg.name, string_agg(coalesce(u.name, u.login, ''), ' ')), $1) > 0.08
			order by score desc, sg.name asc
			limit $3
		`,
		values,
		params.query
	)
}

async function searchAttempts(params: {
	query: string
	like: string
	likeAlt: string
	limit: number
	access: SearchAccess
	executor: SearchExecutor
}) {
	const tests = params.access.tests
	const staff = hasTestZone(tests)
	const result = attemptResultSql('ta')
	const pending = `${result.reviewStatus} = 'pending'`
	const status = `case when ${pending} then 'На проверке' when ${result.passed} then 'Сдано' else 'Не сдано' end`
	const percent = `${result.scorePercentage}::text`
	const values: unknown[] = [params.query, params.like, params.likeAlt, params.limit]
	let whereAccess = ''
	let student = 'coalesce(u.name, u.login)'
	let studentMatch = 'u.name, u.login'
	if (!tests.all && staff) {
		values.push(tests.topicIds)
		whereAccess = `and te.topic_id = any($${values.length}::uuid[])`
		values.push([...STAFF_ROLE_KEYS])
		whereAccess += ` and not exists (select 1 from user_roles r where r.user_id = ta.user_id and r.role_key = any($${values.length}::text[]))`
		student = `coalesce(u.name, nullif(concat_ws(' ', u.first_name, u.last_name), ''), 'Ученик')`
		studentMatch = `u.name, u.first_name, u.last_name`
	}
	if (!staff) {
		values.push(params.access.userId)
		whereAccess = `and ta.user_id = $${values.length} and exists (select 1 from test_assignments a where a.test_id = ta.test_id and a.user_id = ta.user_id)`
	}

	return queryRows(
		params.executor,
		`
			select
				'attempt'::text as type,
				ta.id::text as id,
				(case when ${pending} then te.title else te.title || ' · ' || round(${result.scorePercentage}::numeric)::text || '%' end) as title,
				concat_ws(' · ', top.title, ${student}, ${status}, ta.submitted_at::date::text) as subtitle,
				concat_ws(' · ', top.title, ${student}, ${status}, ta.submitted_at::date::text) as snippet_source,
				case
					when ${staff ? 'true' : 'false'} then ('/admin/attempts/' || ta.id::text)
					else ('/tests/' || top.slug || '/' || te.slug)
				end as href,
				greatest(
					extensions.similarity(coalesce(te.title, ''), $1),
					extensions.similarity(coalesce(top.title, ''), $1),
					extensions.similarity(coalesce(u.name, ''), $1),
					case
						when concat_ws(' ', te.title, top.title, ${studentMatch}, ${percent}, ta.submitted_at::date::text) ilike $2 escape '\\'
							or concat_ws(' ', te.title, top.title, ${studentMatch}, ${percent}, ta.submitted_at::date::text) ilike $3 escape '\\'
						then 1
						else 0
					end
				) as score
			from test_attempts ta
			inner join tests te on te.id = ta.test_id
			inner join topics top on top.id = te.topic_id
			inner join users u on u.id = ta.user_id
			where (
				concat_ws(' ', te.title, top.title, ${studentMatch}, ${status}, ${percent}, ta.submitted_at::date::text) ilike $2 escape '\\'
				or concat_ws(' ', te.title, top.title, ${studentMatch}, ${status}, ${percent}, ta.submitted_at::date::text) ilike $3 escape '\\'
				or extensions.similarity(concat_ws(' ', te.title, top.title, ${studentMatch}, ${percent}, ta.submitted_at::date::text), $1) > 0.08
			)
			${whereAccess}
			order by score desc, ta.submitted_at desc
			limit $4
		`,
		values,
		params.query
	)
}

export async function searchDatabase(params: SearchParams): Promise<SearchResponse> {
	const query = normalizeQuery(params.query)
	const alt = queryAlt(query)
	const limit = clampLimit(params.limit)
	const like = `%${escapeLike(query)}%`
	const likeAlt = `%${escapeLike(alt)}%`
	const executor = params.executor ?? defaultExecutor
	const scopes: Exclude<SearchScope, 'all'>[] =
		params.scope === 'all' ? ['tests', 'questions', 'users', 'groups', 'attempts'] : [params.scope]

	const categories: SearchCategory[] = await mapBounded(
		scopes,
		SEARCH_DB_CONCURRENCY,
		async (scope): Promise<SearchCategory> => {
			const available = canRunScope(scope, params.access)
			let items: SearchResultItem[] = []
			if (available && query.length >= 2) {
				if (scope === 'tests') items = await searchTests({ query, like, limit, access: params.access, executor })
				if (scope === 'questions')
					items = await searchQuestions({ query, like, limit, tests: params.access.tests, executor })
				if (scope === 'users') items = await searchUsers({ query, like, limit, users: params.access.users, executor })
				if (scope === 'groups')
					items = await searchGroups({ query, like, limit, groups: params.access.groups, executor })
				if (scope === 'attempts')
					items = await searchAttempts({ query, like, likeAlt, limit, access: params.access, executor })
			}
			return { scope, title: CATEGORY_TITLES[scope], available, items }
		}
	)

	return {
		query,
		categories,
		total: categories.reduce((sum, category) => sum + category.items.length, 0),
	}
}
