/**
 * Отпечаток каталога схемы public и построчное сравнение двух отпечатков (DRZ-01).
 *
 * Обе стороны (база после цепочки миграций и база из DDL, выведенного drizzle-kit из schema.ts)
 * канонизирует один и тот же сервер PostgreSQL: типы через format_type, умолчания через
 * pg_get_expr, ограничения через pg_get_constraintdef, индексы через pg_get_indexdef.
 *
 * Сравниваются: перечисления, таблицы (RLS), столбцы (тип, NOT NULL, умолчание, identity,
 * generated), ограничения, индексы, политики, расширения. Порядок столбцов намеренно не
 * сравнивается: он отражает историю ALTER TABLE ADD COLUMN, а не схему.
 * Таблица __drizzle_migrations и всё, что к ней относится, исключены.
 *
 * Подключение только к защищённой тестовой базе (assertTestDatabaseUrl); URL не печатается.
 */
import { createRequire } from 'node:module'

import { assertTestDatabaseUrl } from '../../app/server/src/config/test-database-url.ts'

// pg берём из зависимостей серверного воркспейса, новых зависимостей нет
const requireFromServer = createRequire(new URL('../../app/server/package.json', import.meta.url))
const pg = requireFromServer('pg')

const SCHEMA = 'public'
const EXCLUDED_TABLE = '__drizzle_migrations'

/** Объект с ключами в отсортированном порядке */
function sortKeys(object) {
	return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * Снимает отпечаток схемы public базы по URL.
 * Возвращает { enums, extensions, tables }, все словари отсортированы по ключу.
 */
export async function fingerprintDatabase(url) {
	const client = new pg.Client({ connectionString: assertTestDatabaseUrl(url) })
	await client.connect()
	try {
		const params = [SCHEMA, EXCLUDED_TABLE]

		const enumRows = await client.query(
			`SELECT t.typname AS name, e.enumlabel AS label
			FROM pg_type t
			JOIN pg_namespace n ON n.oid = t.typnamespace
			JOIN pg_enum e ON e.enumtypid = t.oid
			WHERE n.nspname = $1 AND t.typtype = 'e'
			ORDER BY t.typname, e.enumsortorder`,
			[SCHEMA]
		)
		const enums = {}
		for (const row of enumRows.rows) (enums[row.name] ??= []).push(row.label)

		const extensionRows = await client.query(
			`SELECT e.extname AS name, n.nspname AS schema
			FROM pg_extension e
			JOIN pg_namespace n ON n.oid = e.extnamespace`
		)
		const extensions = {}
		for (const row of extensionRows.rows) extensions[row.name] = row.schema

		const tableRows = await client.query(
			`SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND c.relname <> $2`,
			params
		)
		const tables = {}
		for (const row of tableRows.rows) {
			tables[row.name] = {
				rls: row.rls,
				forceRls: row.force_rls,
				columns: {},
				constraints: {},
				indexes: {},
				policies: {},
			}
		}

		const columnRows = await client.query(
			`SELECT c.relname AS table_name, a.attname AS name,
				format_type(a.atttypid, a.atttypmod) AS type,
				a.attnotnull AS not_null,
				pg_get_expr(d.adbin, d.adrelid) AS default_expr,
				a.attidentity AS identity,
				a.attgenerated AS generated
			FROM pg_attribute a
			JOIN pg_class c ON c.oid = a.attrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
			WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND c.relname <> $2
				AND a.attnum > 0 AND NOT a.attisdropped`,
			params
		)
		for (const row of columnRows.rows) {
			tables[row.table_name].columns[row.name] = {
				type: row.type,
				notNull: row.not_null,
				default: row.default_expr,
				identity: row.identity,
				generated: row.generated,
			}
		}

		const constraintRows = await client.query(
			`SELECT c.relname AS table_name, k.conname AS name, k.contype AS type,
				pg_get_constraintdef(k.oid) AS definition
			FROM pg_constraint k
			JOIN pg_class c ON c.oid = k.conrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND c.relname <> $2`,
			params
		)
		for (const row of constraintRows.rows) {
			tables[row.table_name].constraints[row.name] = { type: row.type, definition: row.definition }
		}

		const indexRows = await client.query(
			`SELECT c.relname AS table_name, i.relname AS name, pg_get_indexdef(x.indexrelid) AS definition
			FROM pg_index x
			JOIN pg_class c ON c.oid = x.indrelid
			JOIN pg_class i ON i.oid = x.indexrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND c.relname <> $2`,
			params
		)
		for (const row of indexRows.rows) tables[row.table_name].indexes[row.name] = row.definition

		const policyRows = await client.query(
			`SELECT tablename AS table_name, policyname AS name, permissive, roles, cmd, qual, with_check
			FROM pg_policies
			WHERE schemaname = $1 AND tablename <> $2`,
			params
		)
		for (const row of policyRows.rows) {
			const roles = Array.isArray(row.roles)
				? row.roles
				: String(row.roles)
						.replace(/^\{|\}$/g, '')
						.split(',')
			tables[row.table_name].policies[row.name] = {
				permissive: row.permissive,
				roles: [...roles].sort(),
				cmd: row.cmd,
				qual: row.qual,
				withCheck: row.with_check,
			}
		}

		for (const table of Object.values(tables)) {
			table.columns = sortKeys(table.columns)
			table.constraints = sortKeys(table.constraints)
			table.indexes = sortKeys(table.indexes)
			table.policies = sortKeys(table.policies)
		}

		return { enums: sortKeys(enums), extensions: sortKeys(extensions), tables: sortKeys(tables) }
	} finally {
		await client.end()
	}
}

/** Значение для отчёта */
function show(value) {
	if (value === null || value === undefined) return 'null'
	if (typeof value === 'string') return value === '' ? "''" : value
	return JSON.stringify(value)
}

/** Краткое описание политики для строк «только в одной стороне» */
function describePolicy(policy) {
	return `${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.join(',')} USING (${show(policy.qual)}) WITH CHECK (${show(policy.withCheck)})`
}

const CATEGORY_ORDER = ['table', 'enum', 'extension', 'rls', 'column', 'constraint', 'index', 'policy']

/**
 * Построчная разница двух отпечатков.
 * labels = [имя стороны a, имя стороны b], например ['migrations', 'schema.ts'].
 * Строки упорядочены по таблице, затем по категории, затем по имени объекта.
 */
export function diffFingerprints(a, b, labels = ['a', 'b']) {
	const [la, lb] = labels
	const entries = []
	const add = (scope, category, name, text) => entries.push({ scope, category, name, text })

	/** Сравнение двух словарей: «только в одной стороне» или поля, которые различаются */
	const compareMaps = (scope, prefix, category, mapA, mapB, { describe, fields }) => {
		const names = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort()
		for (const name of names) {
			const inA = Object.hasOwn(mapA, name)
			const inB = Object.hasOwn(mapB, name)
			if (inA && !inB) {
				add(scope, category, name, `${prefix}${category} ${name} only in ${la}: ${describe(mapA[name])}`)
			} else if (!inA && inB) {
				add(scope, category, name, `${prefix}${category} ${name} only in ${lb}: ${describe(mapB[name])}`)
			} else {
				for (const [field, read] of fields) {
					const va = read(mapA[name])
					const vb = read(mapB[name])
					if (JSON.stringify(va) !== JSON.stringify(vb)) {
						add(scope, category, name, `${prefix}${category} ${name} ${field}: ${la}=${show(va)} ${lb}=${show(vb)}`)
					}
				}
			}
		}
	}

	compareMaps('', '', 'enum', a.enums, b.enums, {
		describe: (labelsList) => labelsList.join(', '),
		fields: [['labels', (v) => v]],
	})
	compareMaps('', '', 'extension', a.extensions, b.extensions, {
		describe: (schema) => `schema ${schema}`,
		fields: [['schema', (v) => v]],
	})

	const tableNames = [...new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])].sort()
	for (const tableName of tableNames) {
		const ta = a.tables[tableName]
		const tb = b.tables[tableName]
		const prefix = `table ${tableName}: `
		if (!ta || !tb) {
			add(tableName, 'table', tableName, `table ${tableName} only in ${ta ? la : lb}`)
			continue
		}
		if (ta.rls !== tb.rls) add(tableName, 'rls', '', `${prefix}rls ${la}=${ta.rls} ${lb}=${tb.rls}`)
		if (ta.forceRls !== tb.forceRls) {
			add(tableName, 'rls', 'force', `${prefix}force rls ${la}=${ta.forceRls} ${lb}=${tb.forceRls}`)
		}
		compareMaps(tableName, prefix, 'column', ta.columns, tb.columns, {
			describe: (c) => `${c.type}${c.notNull ? ' NOT NULL' : ''}${c.default !== null ? ` DEFAULT ${c.default}` : ''}`,
			fields: [
				['type', (c) => c.type],
				['not null', (c) => c.notNull],
				['default', (c) => c.default],
				['identity', (c) => c.identity],
				['generated', (c) => c.generated],
			],
		})
		compareMaps(tableName, prefix, 'constraint', ta.constraints, tb.constraints, {
			describe: (k) => k.definition,
			fields: [
				['type', (k) => k.type],
				['definition', (k) => k.definition],
			],
		})
		compareMaps(tableName, prefix, 'index', ta.indexes, tb.indexes, {
			describe: (definition) => definition,
			fields: [['definition', (definition) => definition]],
		})
		compareMaps(tableName, prefix, 'policy', ta.policies, tb.policies, {
			describe: describePolicy,
			fields: [
				['permissive', (p) => p.permissive],
				['roles', (p) => p.roles],
				['cmd', (p) => p.cmd],
				['using', (p) => p.qual],
				['with check', (p) => p.withCheck],
			],
		})
	}

	const compare = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
	entries.sort(
		(x, y) =>
			compare(x.scope, y.scope) ||
			CATEGORY_ORDER.indexOf(x.category) - CATEGORY_ORDER.indexOf(y.category) ||
			compare(x.name, y.name) ||
			compare(x.text, y.text)
	)
	return entries.map((entry) => entry.text)
}
