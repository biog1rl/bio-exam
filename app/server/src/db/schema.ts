import {
	pgTable,
	pgEnum,
	uuid,
	text,
	timestamp,
	integer,
	date,
	primaryKey,
	uniqueIndex,
	foreignKey,
	boolean,
	index,
	real,
} from 'drizzle-orm/pg-core'

/** Тип открытия ссылки */
export const linkTarget = pgEnum('link_target', ['_self', '_blank'])

/** Пользователи */
export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		login: text('login'),
		firstName: text('first_name'),
		lastName: text('last_name'),
		name: text('name'),
		avatar: text('avatar'),
		avatarCropped: text('avatar_cropped'),
		avatarColor: text('avatar_color'),
		initials: text('initials'),
		passwordHash: text('password_hash'),
		isActive: boolean('is_active').notNull().default(false),
		invitedAt: timestamp('invited_at'),
		activatedAt: timestamp('activated_at'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		createdBy: uuid('created_by'),
		position: text('position'),
		birthdate: date('birthdate', { mode: 'string' }),
		telegram: text('telegram'),
		phone: text('phone'),
		email: text('email'),
		showInTeam: boolean('show_in_team').notNull().default(false),
		// Параметры кропа аватара
		avatarCropX: real('avatar_crop_x'),
		avatarCropY: real('avatar_crop_y'),
		avatarCropZoom: real('avatar_crop_zoom'),
		avatarCropRotation: real('avatar_crop_rotation'),
		// Координаты view (для восстановления состояния кроппера)
		avatarCropViewX: real('avatar_crop_view_x'),
		avatarCropViewY: real('avatar_crop_view_y'),
	},
	(t) => ({
		loginUniq: uniqueIndex('users_login_uniq').on(t.login),
		createdByFk: foreignKey({
			name: 'users_created_by_fk',
			columns: [t.createdBy],
			foreignColumns: [t.id],
		}),
	})
)

/** Роли (глобальные) */
export const roles = pgTable('roles', {
	key: text('key').primaryKey(), // 'admin' | 'manager' | 'frontend_dev' | 'backend_dev' | 'designer' | 'client'
})

/** Связка пользователь—роль (многие-ко-многим) */
export const userRoles = pgTable(
	'user_roles',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roleKey: text('role_key')
			.notNull()
			.references(() => roles.key, { onDelete: 'cascade' }),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.roleKey] }),
	})
)

/** Инвайты на регистрацию (одноразовые) */
export const invites = pgTable(
	'invites',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(), // sha256 от токена
		expiresAt: timestamp('expires_at').notNull(),
		consumedAt: timestamp('consumed_at'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		tokenUniq: uniqueIndex('invites_token_uniq').on(t.tokenHash),
	})
)

/** RBAC: переопределения грантов ролей */
export const rbacRoleGrants = pgTable(
	'rbac_role_grants',
	{
		roleKey: text('role_key').notNull(), // 'admin' | 'manager' | ...
		domain: text('domain').notNull(), // 'users' | 'docs' | ...
		action: text('action').notNull(), // 'read' | 'edit' | ...
		allow: boolean('allow').notNull().default(true),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.roleKey, t.domain, t.action] }),
	})
)

/** Правила доступа к страницам (паттерн → домен.экшен) */
export const rbacPageRules = pgTable('rbac_page_rules', {
	id: uuid('id').primaryKey().defaultRandom(),
	pattern: text('pattern').notNull(), // например: '/(protected)/users' или '/docs/:slug*'
	domain: text('domain').notNull(),
	action: text('action').notNull(),
	exact: boolean('exact').notNull().default(false),
	enabled: boolean('enabled').notNull().default(true),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
	updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

/** Персональные гранты пользователя (только additive: allow=true) */
export const rbacUserGrants = pgTable(
	'rbac_user_grants',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		action: text('action').notNull(),
		allow: boolean('allow').notNull().default(true),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.domain, t.action] }),
	})
)

/** Пункты бокового меню (сайдбара) */
export const sidebarItems = pgTable(
	'sidebar_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		url: text('url').notNull(),
		icon: text('icon').notNull(), // Название иконки из lucide-react
		target: linkTarget('target').notNull().default('_self'),
		order: integer('order').notNull().default(0),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	(t) => ({
		orderIdx: index('sidebar_items_order_idx').on(t.order),
	})
)
