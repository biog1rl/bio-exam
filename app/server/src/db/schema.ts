import type { QuestionTypeScoringRule, QuestionUiTemplate, TelemetryMap } from '@bio-exam/exam-core'

import { relations, sql } from 'drizzle-orm'
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
	customType,
	index,
	real,
	jsonb,
	pgPolicy,
} from 'drizzle-orm/pg-core'

import type { TestScoringRules } from '../lib/tests/scoring.js'

const jsonbParsedByDriver = customType<{ data: unknown; driverData: unknown }>({
	dataType() {
		return 'jsonb'
	},
	toDriver(value) {
		return JSON.stringify(value)
	},
	fromDriver(value) {
		return value
	},
})

/**
 * Политика deny_direct_access из миграции 0018: прямой доступ через API Supabase закрыт,
 * сервер ходит в базу владельцем таблиц. Каждой таблице нужен свой экземпляр (link() привязывает
 * политику к таблице), поэтому функция, а не общая константа.
 */
function denyDirectAccessPolicy() {
	return pgPolicy('deny_direct_access', {
		as: 'permissive',
		for: 'all',
		to: 'public',
		using: sql`false`,
		withCheck: sql`false`,
	})
}

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
		birthdate: date('birthdate', { mode: 'string' }),
		telegram: text('telegram'),
		phone: text('phone'),
		email: text('email'),
		// Параметры кропа аватара
		avatarCropX: real('avatar_crop_x'),
		avatarCropY: real('avatar_crop_y'),
		avatarCropZoom: real('avatar_crop_zoom'),
		avatarCropRotation: real('avatar_crop_rotation'),
		// Координаты view (для восстановления состояния кроппера)
		avatarCropViewX: real('avatar_crop_view_x'),
		avatarCropViewY: real('avatar_crop_view_y'),
		// Login guard (brute-force protection)
		failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
		lockedUntil: timestamp('locked_until', { withTimezone: true }),
	},
	(t) => ({
		loginUniq: uniqueIndex('users_login_uniq').on(t.login),
		createdByFk: foreignKey({
			name: 'users_created_by_fk',
			columns: [t.createdBy],
			foreignColumns: [t.id],
		}),
		lockedUntilIdx: index('idx_users_locked_until').on(t.lockedUntil),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Роли (глобальные) */
export const roles = pgTable(
	'roles',
	{
		key: text('key').primaryKey(), // 'admin' | 'manager' | 'frontend_dev' | 'backend_dev' | 'designer' | 'client'
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

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
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

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
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

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
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Правила доступа к страницам (паттерн → домен.экшен) */
export const rbacPageRules = pgTable(
	'rbac_page_rules',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		pattern: text('pattern').notNull(), // например: '/(protected)/users' или '/docs/:slug*'
		domain: text('domain').notNull(),
		action: text('action').notNull(),
		exact: boolean('exact').notNull().default(false),
		enabled: boolean('enabled').notNull().default(true),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

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
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

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
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

// =============================================================================
// ТЕСТЫ
// =============================================================================

/** Enum типов вопроса (сохранён для совместимости старых миграций) */
export const questionType = pgEnum('question_type', ['radio', 'checkbox', 'matching', 'short_answer', 'sequence'])

/** Темы тестов */
export const topics = pgTable(
	'topics',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: text('slug').notNull(),
		title: text('title').notNull(),
		description: text('description'),
		order: integer('order').notNull().default(0),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		slugUniq: uniqueIndex('topics_slug_uniq').on(t.slug),
		orderIdx: index('topics_order_idx').on(t.order),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Тесты */
export const tests = pgTable(
	'tests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		topicId: uuid('topic_id')
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		title: text('title').notNull(),
		description: text('description'),
		version: integer('version').notNull().default(1),
		isPublished: boolean('is_published').notNull().default(false),
		showCorrectAnswer: boolean('show_correct_answer').notNull().default(true),
		scoringRules: jsonb('scoring_rules').$type<TestScoringRules>(),
		timeLimitMinutes: integer('time_limit_minutes'),
		redThresholdMinutes: integer('red_threshold_minutes'),
		warningThresholdMinutes: integer('warning_threshold_minutes'),
		passingScore: real('passing_score'),
		order: integer('order').notNull().default(0),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		topicSlugUniq: uniqueIndex('tests_topic_slug_uniq').on(t.topicId, t.slug),
		orderIdx: index('tests_order_idx').on(t.order),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Черновики вопросов внутри теста */
export const questionDrafts = pgTable(
	'question_drafts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		payload: jsonb('payload')
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		lockVersion: integer('lock_version').notNull().default(0),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	(t) => ({
		ownerTestUpdatedIdx: index('question_drafts_owner_test_updated_idx').on(
			t.ownerId,
			t.testId,
			t.updatedAt.desc().nullsFirst()
		),
		testUpdatedIdx: index('question_drafts_test_updated_idx').on(t.testId, t.updatedAt.desc().nullsFirst()),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Глобальные настройки начисления баллов для тестов */
export const testScoringSettings = pgTable(
	'test_scoring_settings',
	{
		id: text('id').primaryKey().default('global'),
		rules: jsonb('rules').$type<TestScoringRules>().notNull(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Справочник типов вопросов */
export const questionTypes = pgTable(
	'question_types',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		key: text('key').notNull(),
		title: text('title').notNull(),
		description: text('description'),
		uiTemplate: text('ui_template').$type<QuestionUiTemplate>().notNull(),
		validationSchema: jsonb('validation_schema'),
		scoringRule: jsonb('scoring_rule').$type<QuestionTypeScoringRule>().notNull(),
		isSystem: boolean('is_system').notNull().default(false),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		keyUniq: uniqueIndex('question_types_key_uniq').on(t.key),
		isActiveIdx: index('question_types_is_active_idx').on(t.isActive),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Переопределения типа вопроса для конкретного теста */
export const testQuestionTypeOverrides = pgTable(
	'test_question_type_overrides',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		questionTypeKey: text('question_type_key').notNull(),
		titleOverride: text('title_override'),
		scoringRuleOverride: jsonb('scoring_rule_override').$type<QuestionTypeScoringRule>(),
		isDisabled: boolean('is_disabled').notNull().default(false),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		testTypeUniq: uniqueIndex('test_question_type_overrides_test_type_uniq').on(t.testId, t.questionTypeKey),
		testIdIdx: index('test_question_type_overrides_test_id_idx').on(t.testId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Вопросы теста */
export const questions = pgTable(
	'questions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		order: integer('order').notNull().default(0),
		points: real('points').notNull().default(1),
		options: jsonb('options'), // для radio/checkbox: [{id, text}]
		matchingPairs: jsonb('matching_pairs'), // для matching: {left: [], right: []}
		promptPath: text('prompt_path'), // путь к prompt.md в Storage
		explanationPath: text('explanation_path'), // путь к explanation.md в Storage
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	(t) => ({
		testIdIdx: index('questions_test_id_idx').on(t.testId),
		orderIdx: index('questions_order_idx').on(t.order),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Поисковая проекция текста вопросов */
export const questionSearchDocuments = pgTable(
	'question_search_documents',
	{
		questionId: uuid('question_id')
			.primaryKey()
			.references(() => questions.id, { onDelete: 'cascade' }),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		topicId: uuid('topic_id')
			.notNull()
			.references(() => topics.id, { onDelete: 'cascade' }),
		promptText: text('prompt_text').notNull().default(''),
		optionsText: text('options_text').notNull().default(''),
		matchingText: text('matching_text').notNull().default(''),
		searchText: text('search_text').notNull().default(''),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	(t) => ({
		testIdIdx: index('question_search_documents_test_id_idx').on(t.testId),
		topicIdIdx: index('question_search_documents_topic_id_idx').on(t.topicId),
		updatedAtIdx: index('question_search_documents_updated_at_idx').on(t.updatedAt),
		searchTextTrgmIdx: index('question_search_documents_search_text_trgm_idx').using(
			'gin',
			t.searchText.op('gin_trgm_ops')
		),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Ключи ответов (версионируемые) */
export const answerKeys = pgTable(
	'answer_keys',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		questionId: uuid('question_id')
			.notNull()
			.references(() => questions.id, { onDelete: 'cascade' }),
		version: integer('version').notNull().default(1),
		correctAnswer: jsonbParsedByDriver('correct_answer').notNull(), // string | string[] | Record<string, string>
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		questionVersionUniq: uniqueIndex('answer_keys_question_version_uniq').on(t.questionId, t.version),
		questionIdIdx: index('answer_keys_question_id_idx').on(t.questionId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Попытки прохождения тестов пользователями */
export const testAttempts = pgTable(
	'test_attempts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id').notNull(),
		userId: uuid('user_id').notNull(),
		answers: jsonb('answers').notNull(), // questionId -> user answer
		results: jsonb('results').notNull(), // per-question result breakdown
		earnedPoints: real('earned_points').notNull(),
		totalPoints: real('total_points').notNull(),
		scorePercentage: real('score_percentage').notNull(),
		passed: boolean('passed').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
		clientAttemptId: text('client_attempt_id'), // optional idempotency key from client
		telemetry: jsonb('telemetry').$type<TelemetryMap>(), // per-question telemetry: questionId -> { timeSpentMs, focusLossCount, visitCount }
	},
	(t) => ({
		testIdIdx: index('idx_test_attempts_test_id').on(t.testId),
		userIdIdx: index('idx_test_attempts_user_id').on(t.userId),
		submittedAtIdx: index('idx_test_attempts_submitted_at').on(t.submittedAt),
		userClientAttemptUniq: uniqueIndex('test_attempts_user_client_attempt_idx')
			.on(t.userId, t.clientAttemptId)
			.where(sql`${t.clientAttemptId} IS NOT NULL`),
		// Имена внешних ключей из миграции 0004 (REFERENCES без имени даёт *_fkey)
		testIdFk: foreignKey({
			name: 'test_attempts_test_id_fkey',
			columns: [t.testId],
			foreignColumns: [tests.id],
		}).onDelete('cascade'),
		userIdFk: foreignKey({
			name: 'test_attempts_user_id_fkey',
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete('cascade'),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Тестовые сессии (для отслеживания времени прохождения) */
export const testSessions = pgTable(
	'test_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		submittedAt: timestamp('submitted_at', { withTimezone: true }),
		attemptId: uuid('attempt_id').references(() => testAttempts.id, { onDelete: 'set null' }),
		draftAnswers: jsonb('draft_answers'), // questionId -> user answer (промежуточное сохранение)
		draftLastQuestionId: text('draft_last_question_id'), // последний открытый вопрос
		draftTelemetry: jsonb('draft_telemetry').$type<TelemetryMap>(),
		draftUpdatedAt: timestamp('draft_updated_at'), // когда последний раз сохранялся черновик
	},
	(t) => ({
		testUserIdx: index('test_sessions_test_user_idx').on(t.testId, t.userId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Назначения тестов студентам (per-student access control) */
export const testAssignments = pgTable(
	'test_assignments',
	{
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
		assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ name: 'test_assignments_pkey', columns: [t.testId, t.userId] }),
		userIdx: index('test_assignments_user_idx').on(t.userId),
		testIdx: index('test_assignments_test_idx').on(t.testId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Глобальные настройки таймера тестов */
export const testTimerSettings = pgTable(
	'test_timer_settings',
	{
		id: text('id').primaryKey().default('global'),
		redThresholdMinutes: integer('red_threshold_minutes').notNull().default(5),
		warningThresholdMinutes: integer('warning_threshold_minutes').notNull().default(1),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Глобальные настройки приложения (key-value) */
export const appSettings = pgTable(
	'app_settings',
	{
		key: text('key').primaryKey(),
		value: text('value').notNull(),
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Группы студентов */
export const studentGroups = pgTable(
	'student_groups',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	() => ({
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Связка пользователь—группа (многие-ко-многим) */
export const userGroups = pgTable(
	'user_groups',
	{
		groupId: uuid('group_id')
			.notNull()
			.references(() => studentGroups.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.groupId, t.userId] }),
		groupIdx: index('user_groups_group_idx').on(t.groupId),
		userIdx: index('user_groups_user_idx').on(t.userId),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

export const authSessions = pgTable(
	'auth_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull().defaultNow(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		revokeReason: text('revoke_reason'),
	},
	(t) => ({
		userIdIdx: index('idx_auth_sessions_user_id').on(t.userId),
		userIdFk: foreignKey({
			name: 'auth_sessions_user_id_fkey',
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete('cascade'),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

/** Refresh tokens for session management */
export const refreshTokens = pgTable(
	'refresh_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').notNull(),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		createdByIp: text('created_by_ip'),
		sessionId: uuid('session_id'),
		usedAt: timestamp('used_at', { withTimezone: true }),
	},
	(t) => ({
		tokenHashIdx: index('idx_refresh_tokens_token_hash').on(t.tokenHash),
		expiresAtIdx: index('idx_refresh_tokens_expires_at').on(t.expiresAt),
		sessionIdIdx: index('idx_refresh_tokens_session_id').on(t.sessionId),
		// Имя внешнего ключа из миграции 0003 (REFERENCES без имени даёт *_fkey)
		userIdFk: foreignKey({
			name: 'refresh_tokens_user_id_fkey',
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete('cascade'),
		sessionIdFk: foreignKey({
			name: 'refresh_tokens_session_id_fkey',
			columns: [t.sessionId],
			foreignColumns: [authSessions.id],
		}).onDelete('cascade'),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

export const loginThrottle = pgTable(
	'login_throttle',
	{
		bucketKey: text('bucket_key').primaryKey(),
		login: text('login'),
		failures: integer('failures').notNull().default(0),
		blockedUntil: timestamp('blocked_until', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		loginIdx: index('idx_login_throttle_login').on(t.login),
		denyDirectAccess: denyDirectAccessPolicy(),
	})
).enableRLS()

// =============================================================================
// RELATIONS
// =============================================================================

export const topicsRelations = relations(topics, ({ one, many }) => ({
	createdByUser: one(users, {
		fields: [topics.createdBy],
		references: [users.id],
	}),
	tests: many(tests),
}))

export const testsRelations = relations(tests, ({ one, many }) => ({
	topic: one(topics, {
		fields: [tests.topicId],
		references: [topics.id],
	}),
	createdByUser: one(users, {
		fields: [tests.createdBy],
		references: [users.id],
		relationName: 'createdByUser',
	}),
	updatedByUser: one(users, {
		fields: [tests.updatedBy],
		references: [users.id],
		relationName: 'updatedByUser',
	}),
	questions: many(questions),
	attempts: many(testAttempts),
	questionTypeOverrides: many(testQuestionTypeOverrides),
}))

export const questionTypesRelations = relations(questionTypes, ({ one, many }) => ({
	createdByUser: one(users, {
		fields: [questionTypes.createdBy],
		references: [users.id],
		relationName: 'questionTypesCreatedByUser',
	}),
	updatedByUser: one(users, {
		fields: [questionTypes.updatedBy],
		references: [users.id],
		relationName: 'questionTypesUpdatedByUser',
	}),
	testOverrides: many(testQuestionTypeOverrides),
}))

export const testQuestionTypeOverridesRelations = relations(testQuestionTypeOverrides, ({ one }) => ({
	test: one(tests, {
		fields: [testQuestionTypeOverrides.testId],
		references: [tests.id],
	}),
	createdByUser: one(users, {
		fields: [testQuestionTypeOverrides.createdBy],
		references: [users.id],
		relationName: 'testQuestionTypeOverridesCreatedByUser',
	}),
	updatedByUser: one(users, {
		fields: [testQuestionTypeOverrides.updatedBy],
		references: [users.id],
		relationName: 'testQuestionTypeOverridesUpdatedByUser',
	}),
}))

export const questionsRelations = relations(questions, ({ one, many }) => ({
	test: one(tests, {
		fields: [questions.testId],
		references: [tests.id],
	}),
	answerKeys: many(answerKeys),
	searchDocument: one(questionSearchDocuments, {
		fields: [questions.id],
		references: [questionSearchDocuments.questionId],
	}),
}))

export const questionSearchDocumentsRelations = relations(questionSearchDocuments, ({ one }) => ({
	question: one(questions, {
		fields: [questionSearchDocuments.questionId],
		references: [questions.id],
	}),
	test: one(tests, {
		fields: [questionSearchDocuments.testId],
		references: [tests.id],
	}),
	topic: one(topics, {
		fields: [questionSearchDocuments.topicId],
		references: [topics.id],
	}),
}))

export const answerKeysRelations = relations(answerKeys, ({ one }) => ({
	question: one(questions, {
		fields: [answerKeys.questionId],
		references: [questions.id],
	}),
	createdByUser: one(users, {
		fields: [answerKeys.createdBy],
		references: [users.id],
	}),
}))

export const testAttemptsRelations = relations(testAttempts, ({ one }) => ({
	test: one(tests, {
		fields: [testAttempts.testId],
		references: [tests.id],
	}),
	user: one(users, {
		fields: [testAttempts.userId],
		references: [users.id],
	}),
}))

export const testSessionsRelations = relations(testSessions, ({ one }) => ({
	test: one(tests, {
		fields: [testSessions.testId],
		references: [tests.id],
	}),
	user: one(users, {
		fields: [testSessions.userId],
		references: [users.id],
	}),
	attempt: one(testAttempts, {
		fields: [testSessions.attemptId],
		references: [testAttempts.id],
	}),
}))

export const studentGroupsRelations = relations(studentGroups, ({ one, many }) => ({
	createdByUser: one(users, {
		fields: [studentGroups.createdBy],
		references: [users.id],
	}),
	userGroups: many(userGroups),
}))

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
	group: one(studentGroups, {
		fields: [userGroups.groupId],
		references: [studentGroups.id],
	}),
	user: one(users, {
		fields: [userGroups.userId],
		references: [users.id],
	}),
}))
