/**
 * Негативные фикстуры diffFingerprints (DRZ-01): сравнение без базы, на собранных вручную отпечатках.
 * Запуск: node --test scripts/lib/schema-fingerprint.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffFingerprints } from './schema-fingerprint.mjs'

const LABELS = ['migrations', 'schema.ts']

/** Свежий отпечаток одной таблицы со всеми категориями */
function base() {
	return {
		enums: { role: ['admin', 'user'] },
		extensions: { pg_trgm: 'public' },
		tables: {
			users: {
				rls: true,
				forceRls: false,
				columns: {
					id: { type: 'uuid', notNull: true, default: 'gen_random_uuid()', identity: '', generated: '' },
					created_at: {
						type: 'timestamp with time zone',
						notNull: true,
						default: 'now()',
						identity: '',
						generated: '',
					},
				},
				constraints: {
					users_pkey: { type: 'p', definition: 'PRIMARY KEY (id)' },
					users_org_fk: { type: 'f', definition: 'FOREIGN KEY (org_id) REFERENCES orgs(id)' },
				},
				indexes: {
					users_created_idx: 'CREATE INDEX users_created_idx ON public.users USING btree (created_at)',
				},
				policies: {
					users_read: { permissive: 'PERMISSIVE', roles: ['public'], cmd: 'SELECT', qual: 'true', withCheck: null },
				},
			},
		},
	}
}

const diff = (a, b) => diffFingerprints(a, b, LABELS)

test('одинаковые отпечатки дают пустую разницу', () => {
	assert.deepEqual(diff(base(), base()), [])
})

test('тип столбца timestamp против timestamptz', () => {
	const b = base()
	b.tables.users.columns.created_at.type = 'timestamp without time zone'
	assert.deepEqual(diff(base(), b), [
		'table users: column created_at type: migrations=timestamp with time zone schema.ts=timestamp without time zone',
	])
})

test('индекс только в одной стороне', () => {
	const b = base()
	delete b.tables.users.indexes.users_created_idx
	const lines = diff(base(), b)
	assert.equal(lines.length, 1)
	assert.ok(lines[0].startsWith('table users: index users_created_idx only in migrations: CREATE INDEX'), lines[0])
	const reverse = diff(b, base())
	assert.ok(reverse[0].includes('only in schema.ts'), reverse[0])
})

test('определение индекса: DESC и NULLS FIRST', () => {
	const b = base()
	b.tables.users.indexes.users_created_idx =
		'CREATE INDEX users_created_idx ON public.users USING btree (created_at DESC NULLS FIRST)'
	const lines = diff(base(), b)
	assert.equal(lines.length, 1)
	assert.match(
		lines[0],
		/^table users: index users_created_idx definition: migrations=.*\(created_at\) schema\.ts=.*DESC NULLS FIRST\)$/
	)
})

test('флаг RLS различается', () => {
	const b = base()
	b.tables.users.rls = false
	assert.deepEqual(diff(base(), b), ['table users: rls migrations=true schema.ts=false'])
})

test('политика только в одной стороне', () => {
	const b = base()
	delete b.tables.users.policies.users_read
	const lines = diff(base(), b)
	assert.deepEqual(lines, [
		'table users: policy users_read only in migrations: PERMISSIVE FOR SELECT TO public USING (true) WITH CHECK (null)',
	])
})

test('имя внешнего ключа различается', () => {
	const b = base()
	b.tables.users.constraints.users_org_id_fkey = b.tables.users.constraints.users_org_fk
	delete b.tables.users.constraints.users_org_fk
	assert.deepEqual(diff(base(), b), [
		'table users: constraint users_org_fk only in migrations: FOREIGN KEY (org_id) REFERENCES orgs(id)',
		'table users: constraint users_org_id_fkey only in schema.ts: FOREIGN KEY (org_id) REFERENCES orgs(id)',
	])
})

test('имя первичного ключа различается', () => {
	const b = base()
	b.tables.users.constraints.users_id_pk = b.tables.users.constraints.users_pkey
	delete b.tables.users.constraints.users_pkey
	assert.deepEqual(diff(base(), b), [
		'table users: constraint users_id_pk only in schema.ts: PRIMARY KEY (id)',
		'table users: constraint users_pkey only in migrations: PRIMARY KEY (id)',
	])
})

test('порядок строк стабилен: по таблице, категории, имени, и не зависит от порядка ключей', () => {
	const a = base()
	const b = base()
	b.tables.users.rls = false
	b.tables.users.columns.created_at.type = 'timestamp without time zone'
	delete b.tables.users.indexes.users_created_idx
	b.enums.role = ['admin']
	b.tables.alpha = { rls: false, forceRls: false, columns: {}, constraints: {}, indexes: {}, policies: {} }
	const lines = diff(a, b)
	const kinds = lines.map((line) => line.split(' ').slice(0, 3).join(' '))
	assert.deepEqual(kinds, [
		'enum role labels:',
		'table alpha only',
		'table users: rls',
		'table users: column',
		'table users: index',
	])
	// Те же отпечатки с обратным порядком ключей дают ту же разницу
	const reversed = JSON.parse(JSON.stringify(b), (_k, v) =>
		v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v
	)
	assert.deepEqual(diff(a, reversed), lines)
	assert.deepEqual(diff(a, b), lines)
})
