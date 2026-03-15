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
	index,
	real,
	jsonb,
} from 'drizzle-orm/pg-core'
import type { TestScoringRules } from '../lib/tests/scoring.js'
import type { QuestionTypeScoringRule, QuestionUiTemplate } from '../lib/tests/question-types.js'

export type QuestionTelemetry = {
  timeSpentMs: number
  focusLossCount: number
  visitCount: number
}
export type TelemetryMap = Record<string, QuestionTelemetry>

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
	})
)

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
	})
)

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
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
		lockVersion: integer('lock_version').notNull().default(0),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().defaultNow(),
	},
	(t) => ({
		ownerTestUpdatedIdx: index('question_drafts_owner_test_updated_idx').on(t.ownerId, t.testId, t.updatedAt),
		testUpdatedIdx: index('question_drafts_test_updated_idx').on(t.testId, t.updatedAt),
	})
)

/** Глобальные настройки начисления баллов для тестов */
export const testScoringSettings = pgTable('test_scoring_settings', {
	id: text('id').primaryKey().default('global'),
	rules: jsonb('rules').$type<TestScoringRules>().notNull(),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
	updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

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
	})
)

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
	})
)

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
	})
)

/** Ключи ответов (версионируемые) */
export const answerKeys = pgTable(
	'answer_keys',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		questionId: uuid('question_id')
			.notNull()
			.references(() => questions.id, { onDelete: 'cascade' }),
		version: integer('version').notNull().default(1),
		correctAnswer: jsonb('correct_answer').notNull(), // string | string[] | Record<string, string>
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
	},
	(t) => ({
		questionVersionUniq: uniqueIndex('answer_keys_question_version_uniq').on(t.questionId, t.version),
		questionIdIdx: index('answer_keys_question_id_idx').on(t.questionId),
	})
)

/** Попытки прохождения тестов пользователями */
export const testAttempts = pgTable(
	'test_attempts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id')
			.notNull()
			.references(() => tests.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		answers: jsonb('answers').notNull(), // questionId -> user answer
		results: jsonb('results').notNull(), // per-question result breakdown
		earnedPoints: real('earned_points').notNull(),
		totalPoints: real('total_points').notNull(),
		scorePercentage: real('score_percentage').notNull(),
		passed: boolean('passed').notNull().default(false),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		submittedAt: timestamp('submitted_at').notNull().defaultNow(),
		clientAttemptId: text('client_attempt_id'), // optional idempotency key from client
		telemetry: jsonb('telemetry').$type<TelemetryMap>(), // per-question telemetry: questionId -> { timeSpentMs, focusLossCount, visitCount }
	},
	(t) => ({
		testIdIdx: index('test_attempts_test_id_idx').on(t.testId),
		userIdIdx: index('test_attempts_user_id_idx').on(t.userId),
		submittedAtIdx: index('test_attempts_submitted_at_idx').on(t.submittedAt),
		userClientAttemptUniq: uniqueIndex('test_attempts_user_client_attempt_idx')
			.on(t.userId, t.clientAttemptId)
			.where(sql`${t.clientAttemptId} IS NOT NULL`),
	})
)

/** Тестовые сессии (для отслеживания времени прохождения) */
export const testSessions = pgTable(
	'test_sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at').notNull().defaultNow(),
		submittedAt: timestamp('submitted_at'),
		attemptId: uuid('attempt_id').references(() => testAttempts.id, { onDelete: 'set null' }),
	},
	(t) => ({
		testUserIdx: index('test_sessions_test_user_idx').on(t.testId, t.userId),
	})
)

/** Назначения тестов студентам (per-student access control) */
export const testAssignments = pgTable(
	'test_assignments',
	{
		testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
		userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
		assignedAt: timestamp('assigned_at').notNull().defaultNow(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.testId, t.userId] }),
		userIdx: index('test_assignments_user_idx').on(t.userId),
		testIdx: index('test_assignments_test_idx').on(t.testId),
	})
)

/** Глобальные настройки таймера тестов */
export const testTimerSettings = pgTable('test_timer_settings', {
	id: text('id').primaryKey().default('global'),
	redThresholdMinutes: integer('red_threshold_minutes').notNull().default(5),
	warningThresholdMinutes: integer('warning_threshold_minutes').notNull().default(1),
	updatedAt: timestamp('updated_at').notNull().defaultNow(),
	updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

/** Глобальные настройки приложения (key-value) */
export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
})

/** Refresh tokens for session management */
export const refreshTokens = pgTable(
	'refresh_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		revokedAt: timestamp('revoked_at'),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		createdByIp: text('created_by_ip'),
	},
	(t) => ({
		tokenHashIdx: index('refresh_tokens_token_hash_idx').on(t.tokenHash),
	})
)

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
